module Api
  module V1
    class CartController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request # Skip required auth for all actions
      before_action :authenticate_optional # Use optional auth instead

      # GET /api/v1/cart
      def show
        cart_items = get_cart_items
        render json: {
          items: cart_items.map { |item| cart_item_json(item) },
          subtotal_cents: cart_items.sum(&:subtotal_cents),
          item_count: cart_items.sum(:quantity)
        }
      end

      # POST /api/v1/cart/items
      def add_item
        Rails.logger.info "🟢 API: add_item called"
        Rails.logger.info "  - variant_id: #{params[:product_variant_id]}"
        Rails.logger.info "  - quantity: #{params[:quantity]}"
        Rails.logger.info "  - session_id: #{request.headers['X-Session-ID']}"

        variant = ProductVariant.find(params[:product_variant_id])
        product = variant.product
        quantity = params[:quantity].to_i

        # Validate quantity
        if quantity < 1
          return render json: { error: "Quantity must be at least 1" }, status: :unprocessable_entity
        end

        # Check stock availability ONLY if inventory is tracked
        if product.inventory_level != "none"
          # Check variant availability (respects available flag + stock)
          unless variant.actually_available?
            return render json: { error: "#{variant.display_name} is out of stock" }, status: :unprocessable_entity
          end

          # Check quantity based on inventory level
          case product.inventory_level
          when "variant"
            if quantity > variant.stock_quantity
              return render json: {
                error: "Only #{variant.stock_quantity} #{variant.display_name} available",
                available_quantity: variant.stock_quantity
              }, status: :unprocessable_entity
            end
          when "product"
            if quantity > product.product_stock_quantity
              return render json: {
                error: "Only #{product.product_stock_quantity} available",
                available_quantity: product.product_stock_quantity
              }, status: :unprocessable_entity
            end
          end
        end

        # Find or create cart item
        cart_item = find_or_initialize_cart_item(variant.id)
        Rails.logger.info "  - cart_item persisted?: #{cart_item.persisted?}"
        Rails.logger.info "  - cart_item current quantity: #{cart_item.quantity}" if cart_item.persisted?

        existing_products = get_cart_items.includes(product_variant: { product: :product_locations }).map { |item| item.product_variant.product }
        if FulfillmentValidator.mixed_cart_incompatible?(existing_products + [ product ])
          return render json: {
            error: "This item cannot be combined with your current cart due to fulfillment constraints. Keep your cart to pickup-only or shipping-only items."
          }, status: :unprocessable_entity
        end

        if cart_item.persisted?
          # Update existing cart item
          new_quantity = cart_item.quantity + quantity
          Rails.logger.info "  - new_quantity will be: #{new_quantity} (#{cart_item.quantity} + #{quantity})"

          if new_quantity > variant.stock_quantity
            return render json: {
              error: "Cannot add #{quantity} more. Only #{variant.stock_quantity} total available (you have #{cart_item.quantity} in cart)",
              available_quantity: variant.stock_quantity,
              current_quantity: cart_item.quantity
            }, status: :unprocessable_entity
          end
          cart_item.quantity = new_quantity
        else
          # New cart item
          Rails.logger.info "  - creating new cart item with quantity: #{quantity}"
          cart_item.quantity = quantity
        end

        if cart_item.save
          Rails.logger.info "✅ Cart item saved. New quantity: #{cart_item.quantity}"
          total_cart_count = get_cart_items.sum(:quantity)
          Rails.logger.info "  - Total cart count: #{total_cart_count}"

          render json: {
            message: "Item added to cart",
            cart_item: cart_item_json(cart_item),
            cart_count: total_cart_count
          }, status: :created
        else
          render json: { errors: cart_item.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Product variant not found" }, status: :not_found
      end

      # PUT /api/v1/cart/items/:id
      def update_item
        cart_item = get_cart_items.find(params[:id])
        quantity = params[:quantity].to_i

        if quantity < 1
          return render json: { error: "Quantity must be at least 1" }, status: :unprocessable_entity
        end

        # Check stock availability
        variant = cart_item.product_variant
        if quantity > variant.stock_quantity
          return render json: {
            error: "Only #{variant.stock_quantity} #{variant.display_name} available",
            available_quantity: variant.stock_quantity
          }, status: :unprocessable_entity
        end

        if cart_item.update(quantity: quantity)
          render json: {
            message: "Cart item updated",
            cart_item: cart_item_json(cart_item),
            cart_count: get_cart_items.sum(:quantity)
          }
        else
          render json: { errors: cart_item.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Cart item not found" }, status: :not_found
      end

      # DELETE /api/v1/cart/items/:id
      def destroy_item
        cart_item = get_cart_items.find(params[:id])
        cart_item.destroy
        render json: {
          message: "Item removed from cart",
          cart_count: get_cart_items.sum(:quantity)
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Cart item not found" }, status: :not_found
      end

      # DELETE /api/v1/cart
      def clear
        items = get_cart_items
        count = items.count
        items.destroy_all
        render json: { message: "Cart cleared", items_removed: count }
      end

      # POST /api/v1/cart/validate
      # Validates all cart items against current stock - CRITICAL for race condition prevention
      def validate
        cart_items = get_cart_items.includes(product_variant: { product: :product_locations })
        issues = []
        products = cart_items.map { |item| item.product_variant.product }

        if FulfillmentValidator.mixed_cart_incompatible?(products)
          issues << {
            cart_item_id: cart_items.first&.id || 0,
            type: "mixed_fulfillment",
            message: "Your cart has pickup-only and shipping-only items that cannot be checked out together.",
            item_name: "Cart",
            action: "review"
          }
        end

        cart_items.each do |item|
          variant = item.product_variant
          product = variant.product

          # Check if product/variant is still available
          unless product.published?
            issues << {
              cart_item_id: item.id,
              type: "unavailable",
              message: "#{product.name} (#{variant.display_name}) is no longer available",
              item_name: "#{product.name} - #{variant.display_name}",
              action: "remove"
            }
            next
          end

          # Check stock availability ONLY if inventory is tracked
          next if product.inventory_level == "none" # Skip stock checks for non-tracked inventory

          # Check variant availability (respects available flag + stock)
          unless variant.actually_available?
            issues << {
              cart_item_id: item.id,
              type: "out_of_stock",
              message: "#{product.name} (#{variant.display_name}) is out of stock",
              item_name: "#{product.name} - #{variant.display_name}",
              available: 0,
              requested: item.quantity,
              action: "remove"
            }
            next
          end

          # Check if quantity exceeds available stock based on inventory level
          case product.inventory_level
          when "variant"
            if item.quantity > variant.stock_quantity
              issues << {
                cart_item_id: item.id,
                type: "quantity_reduced",
                message: "Only #{variant.stock_quantity} of #{product.name} (#{variant.display_name}) available",
                item_name: "#{product.name} - #{variant.display_name}",
                available: variant.stock_quantity,
                requested: item.quantity,
                action: "reduce"
              }
            end
          when "product"
            if item.quantity > product.product_stock_quantity
              issues << {
                cart_item_id: item.id,
                type: "quantity_reduced",
                message: "Only #{product.product_stock_quantity} of #{product.name} available",
                item_name: "#{product.name} - #{variant.display_name}",
                available: product.product_stock_quantity,
                requested: item.quantity,
                action: "reduce"
              }
            end
          end
        end

        render json: {
          valid: issues.empty?,
          issues: issues,
          cart_items: cart_items.map { |item| cart_item_json(item) }
        }
      end

      private

      def get_cart_items
        # Don't include product_images here to avoid JOIN multiplication in SUM queries
        # Product images will be loaded individually when needed
        if current_user
          # First, merge any session cart items to the user
          merge_session_cart_to_user if session_id.present?
          current_user.cart_items.includes(product_variant: { product: :product_locations })
        elsif session_id.present?
          CartItem.for_session(session_id).includes(product_variant: { product: :product_locations })
        else
          CartItem.none
        end
      end

      # Merge session-based cart items to the logged-in user
      # This handles the case where user added items before logging in
      def merge_session_cart_to_user
        return unless current_user && session_id.present?

        session_items = CartItem.for_session(session_id)
        return if session_items.empty?

        session_items.each do |session_item|
          # Check if user already has this variant in their cart
          existing_item = current_user.cart_items.find_by(product_variant_id: session_item.product_variant_id)

          if existing_item
            # Merge quantities
            existing_item.update(quantity: existing_item.quantity + session_item.quantity)
            session_item.destroy
          else
            # Transfer the session item to the user
            session_item.update(user_id: current_user.id, session_id: nil)
          end
        end
      end

      def find_or_initialize_cart_item(variant_id)
        if current_user
          current_user.cart_items.find_or_initialize_by(product_variant_id: variant_id)
        elsif session_id.present?
          CartItem.find_or_initialize_by(session_id: session_id, product_variant_id: variant_id)
        else
          CartItem.new(product_variant_id: variant_id, session_id: generate_session_id)
        end
      end

      def session_id
        @session_id ||= request.headers["X-Session-ID"] || request.cookies["session_id"]
      end

      def generate_session_id
        SecureRandom.uuid
      end

      def cart_item_json(item)
        variant = item.product_variant
        product = variant.product
        {
          id: item.id,
          quantity: item.quantity,
          subtotal_cents: item.subtotal_cents,
          product_variant: {
            id: variant.id,
            sku: variant.sku,
            display_name: variant.variant_name || variant.display_name,
            price_cents: variant.price_cents,
            stock_quantity: variant.stock_quantity,
            in_stock: variant.in_stock?,
            size: variant.size,
            color: variant.color
          },
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            published: product.published?,
            allow_pickup: product.allow_pickup,
            allow_shipping: product.allow_shipping,
            available_location_ids: product.product_locations.available.pluck(:location_id),
            primary_image_url: product.primary_image&.signed_url,
            inventory_level: product.inventory_level,
            product_stock_quantity: product.product_stock_quantity
          },
          availability: {
            available: item.available?,
            quantity_exceeds_stock: item.quantity_exceeds_stock?,
            available_quantity: item.available_quantity,
            max_available: item.max_available_quantity
          }
        }
      end
    end
  end
end
