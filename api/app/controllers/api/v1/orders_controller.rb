# frozen_string_literal: true

module Api
  module V1
    class OrdersController < ApplicationController
      COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze

      rescue_from ActionController::ParameterMissing do |e|
        render json: { error: "Missing required parameter: #{e.param}. Wrap your request body in an '#{e.param}' key." }, status: :bad_request
      end
      include Authenticatable
      skip_before_action :authenticate_request, only: [ :create, :show ] # Allow guest checkout and order viewing
      before_action :authenticate_optional, only: [ :create, :show ]
      before_action :require_admin!, only: [ :index, :update ]

      # GET /api/v1/orders/my
      # List orders for the current authenticated user
      def my_orders
        unless current_user
          return render json: { error: "Authentication required" }, status: :unauthorized
        end

        page = (params[:page] || 1).to_i
        per_page = (params[:per_page] || 10).to_i

        orders_query = current_user.orders.includes(:order_items).order(created_at: :desc)

        # Optional status filter
        if params[:status].present?
          orders_query = orders_query.where(status: params[:status])
        end

        total_count = orders_query.count
        orders = orders_query.offset((page - 1) * per_page).limit(per_page)

        render json: {
          orders: orders.map { |order| customer_order_json(order) },
          pagination: {
            current_page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end

      # GET /api/v1/orders
      # List all orders (admin only)
      def index
        # Pagination
        page = (params[:page] || 1).to_i
        per_page = (params[:per_page] || 25).to_i

        # Base query
        orders_query = Order.includes(order_items: { product_variant: { product: :collections } }, user: []).order(created_at: :desc)

        # Filters
        if params[:status].present?
          orders_query = orders_query.where(status: params[:status])
        end

        if params[:payment_status].present?
          orders_query = orders_query.where(payment_status: params[:payment_status])
        end

        if params[:order_type].present?
          orders_query = orders_query.where(order_type: params[:order_type])
        end

        if params[:fulfillment_type].present?
          orders_query = orders_query.where(fulfillment_type: params[:fulfillment_type])
        end

        if params[:location_id].present?
          orders_query = orders_query.where(location_id: params[:location_id].to_i)
        end

        if params[:business_line].present?
          orders_query = apply_business_line_filter(orders_query, params[:business_line].to_s)
        end

        # Search by order number, email, or name (case-insensitive for PostgreSQL)
        if params[:search].present?
          search_term = "%#{params[:search]}%"
          orders_query = orders_query.where(
            "order_number ILIKE ? OR customer_email ILIKE ? OR customer_name ILIKE ?",
            search_term, search_term, search_term
          )
        end

        # Date range filter
        start_at = parse_datetime_param(params[:start_date])
        end_at = parse_datetime_param(params[:end_date], end_of_day: true)

        orders_query = orders_query.where("created_at >= ?", start_at) if start_at
        orders_query = orders_query.where("created_at <= ?", end_at) if end_at

        # Paginate
        total_count = orders_query.count
        orders = orders_query.offset((page - 1) * per_page).limit(per_page)

        render json: {
          orders: orders.map { |order| order_json(order) },
          pagination: {
            current_page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end

      # POST /api/v1/orders
      # Create a new order from cart + shipping + payment
      def create
        # Get site settings to check test mode
        settings = SiteSetting.instance

        # Get cart items
        cart_items = get_cart_items

        if cart_items.empty?
          return render json: { error: "Cart is empty" }, status: :unprocessable_entity
        end

        # Validate cart items are still available
        validation_errors = validate_cart_items(cart_items)
        if validation_errors.any?
          return render json: { error: "Cart validation failed", issues: validation_errors }, status: :unprocessable_entity
        end

        fulfillment_type = normalized_fulfillment_type
        location_id = pickup_location_id
        fulfillment_issues = FulfillmentValidator.validate_cart(
          cart_items: cart_items,
          fulfillment_type: fulfillment_type,
          location_id: location_id
        )
        if fulfillment_issues.any?
          return render json: { error: "Cart fulfillment validation failed", issues: fulfillment_issues }, status: :unprocessable_entity
        end

        # Create order
        order = build_order(cart_items, fulfillment_type: fulfillment_type, location_id: location_id)

        # Process payment
        payment_intent_id = order_params[:payment_intent_id]
        payment_method_params = order_params[:payment_method] || {}
        payment_type = payment_method_params[:type]

        if payment_type == "test" && settings.payment_test_mode
          # Test mode: simulate payment
          payment_result = PaymentService.process_payment(
            amount_cents: order.total_cents,
            payment_method: payment_method_params,
            order: order,
            customer_email: order.email,
            test_mode: true
          )
          unless payment_result[:success]
            return render json: { error: payment_result[:error] }, status: :unprocessable_entity
          end
          order.payment_status = "paid"
          order.payment_intent_id = payment_result[:charge_id]
        elsif payment_intent_id.present?
          # Real Stripe payment: verify the PaymentIntent succeeded
          verification = verify_payment_intent(payment_intent_id, order.total_cents)
          unless verification[:success]
            return render json: { error: verification[:error] }, status: :unprocessable_entity
          end
          order.payment_status = "paid"
          order.payment_intent_id = payment_intent_id
        else
          # Legacy token-based flow
          payment_result = PaymentService.process_payment(
            amount_cents: order.total_cents,
            payment_method: payment_method_params,
            order: order,
            customer_email: order.email,
            test_mode: settings.payment_test_mode
          )
          unless payment_result[:success]
            return render json: { error: payment_result[:error] }, status: :unprocessable_entity
          end
          order.payment_status = "paid"
          order.payment_intent_id = payment_result[:charge_id]
        end

        Rails.logger.info "💾 Attempting to save order..."
        Rails.logger.info "   Order attributes: #{order.attributes.slice('order_type', 'status', 'email', 'phone', 'customer_name', 'shipping_city', 'shipping_state', 'payment_status').inspect}"

        if order.save
          Rails.logger.info "✅ Order saved successfully! Order ##{order.order_number}"
          # Deduct inventory (with locking to prevent race conditions) and create audit trail
          deduct_inventory(cart_items, order)

          # Clear cart
          clear_cart(cart_items)

          # Send customer notifications — respects per-channel toggles
          has_email = order.customer_email.present?
          has_phone = order.customer_phone.present?

          if settings.enable_order_emails && has_email
            SendOrderConfirmationEmailJob.perform_later(order.id)
          end

          if settings.enable_order_sms && has_phone
            # Claim the seq immediately so a fast admin "confirmed" (seq=2) can't
            # discard this job. The job uses confirmation_sms_sent boolean instead
            # of the seq system to avoid the race entirely.
            SendOrderConfirmationSmsJob.perform_later(order.id)
          end

          # Admin notifications — not gated by customer toggles
          SendAdminNotificationEmailJob.perform_later(order.id)
          SendAdminOrderSmsJob.perform_later(order.id)

          render json: {
            success: true,
            order: order_json(order),
            message: settings.payment_test_mode? ? "Test order created successfully!" : "Order placed successfully!"
          }, status: :created
        else
          Rails.logger.error "❌ Order validation failed:"
          order.errors.full_messages.each { |msg| Rails.logger.error "   - #{msg}" }
          render json: { error: "Failed to create order", errors: order.errors.full_messages }, status: :unprocessable_entity
        end
      rescue StandardError => e
        Rails.logger.error "Order creation error: #{e.class} - #{e.message}"
        Rails.logger.error e.backtrace.first(5).join("\n")
        render json: { error: "Failed to create order. Please try again." }, status: :internal_server_error
      end

      # GET /api/v1/orders/:id
      # Get order details
      def show
        order = find_order_by_id_or_number(params[:id])
        return unless authorize_order_access(order)

        render json: {
          order: detailed_order_json(order)
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Order not found" }, status: :not_found
      end

      # PATCH /api/v1/orders/:id
      # Update order (admin only - for status changes, notes, etc.)
      def update
        order = Order.find(params[:id])

        if order.update(order_update_params)
          render json: {
            success: true,
            order: detailed_order_json(order),
            message: "Order updated successfully"
          }
        else
          render json: {
            success: false,
            errors: order.errors.full_messages
          }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Order not found" }, status: :not_found
      end

      private

      def get_cart_items
        session_id = request.headers["X-Session-ID"] || request.cookies["session_id"]
        if session_id.present?
          return CartItem.where(session_id: session_id).includes(product_variant: { product: [ :product_images, :product_locations ] })
        end

        return [] unless current_user

        current_user.cart_items.includes(product_variant: { product: [ :product_images, :product_locations ] })
      end

      # Merge session-based cart items to the logged-in user
      # This handles the case where user added items before logging in
      def merge_session_cart_to_user
        session_id = request.headers["X-Session-ID"] || request.cookies["session_id"]
        return unless current_user && session_id.present?

        session_items = CartItem.where(session_id: session_id)
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

      def parse_datetime_param(value, end_of_day: false)
        return nil if value.blank?

        if value.match?(/^\d{4}-\d{2}-\d{2}$/)
          date = Date.parse(value) rescue nil
          return nil unless date
          return end_of_day ? date.end_of_day : date.beginning_of_day
        end

        Time.zone.parse(value) rescue nil
      end

      def validate_cart_items(cart_items)
        issues = []

        cart_items.each do |item|
          variant = item.product_variant
          product = variant.product

          # Check if product is actually available (respects published + inventory)
          unless product.actually_available?
            issues << {
              item_id: item.id,
              product_name: product.name,
              variant_name: variant.display_name,
              message: "#{product.name} is no longer available"
            }
            next
          end

          # Check variant availability (respects available flag + stock)
          unless variant.actually_available?
            issues << {
              item_id: item.id,
              product_name: product.name,
              variant_name: variant.display_name,
              message: "#{product.name} - #{variant.display_name} is out of stock"
            }
            next
          end

          # Check sufficient stock based on inventory level
          case product.inventory_level
          when "variant"
            if item.quantity > variant.stock_quantity
              issues << {
                item_id: item.id,
                product_name: product.name,
                variant_name: variant.display_name,
                message: "Only #{variant.stock_quantity} of #{product.name} - #{variant.display_name} available"
              }
            end

          when "product"
            product_stock = product.product_stock_quantity || 0
            if item.quantity > product_stock
              issues << {
                item_id: item.id,
                product_name: product.name,
                variant_name: variant.display_name,
                message: "Only #{product_stock} of #{product.name} available"
              }
            end

          when "none"
            # No stock validation needed
            next
          end
        end

        issues
      end

      def build_order(cart_items, fulfillment_type:, location_id:)
        shipping_address = order_params[:shipping_address] || {}
        shipping_method_params = order_params[:shipping_method] || {}

        order = Order.new(
          user: current_user,
          order_type: "retail",
          fulfillment_type: fulfillment_type,
          location_id: (fulfillment_type == "pickup" ? location_id : nil),
          status: "pending",
          email: order_params[:customer_email] || order_params[:email],  # HAF-13: prefer canonical name
          phone: order_params[:customer_phone] || order_params[:phone],  # HAF-13: prefer canonical name
          name: order_params[:customer_name] || shipping_address[:name],  # HAF-13: prefer canonical name

          # Shipping address
          shipping_address_line1: shipping_address[:street1] || order_params[:shipping_address_line1],
          shipping_address_line2: shipping_address[:street2] || order_params[:shipping_address_line2],
          shipping_city: shipping_address[:city] || order_params[:shipping_city],
          shipping_state: shipping_address[:state] || order_params[:shipping_state],
          shipping_zip: shipping_address[:zip] || order_params[:shipping_zip],
          shipping_country: shipping_address[:country] || order_params[:shipping_country] || "US",

          # Shipping method (store as JSON/text with carrier and service info)
          shipping_method: [ shipping_method_params[:carrier], shipping_method_params[:service] ].compact.join(" ").presence,
          shipping_cost_cents: fulfillment_type == "pickup" ? 0 : (shipping_method_params[:rate_cents] || 0)
        )

        # Calculate totals
        subtotal_cents = 0

        cart_items.each do |cart_item|
          item_price = cart_item.product_variant.price_cents
          item_total = item_price * cart_item.quantity

          order.order_items.build(
            product_variant: cart_item.product_variant,
            product_id: cart_item.product.id,
            quantity: cart_item.quantity,
            unit_price_cents: item_price,
            total_price_cents: item_total,
            product_name: cart_item.product.name,
            product_sku: cart_item.product_variant.sku,
            variant_name: cart_item.product_variant.display_name
          )

          subtotal_cents += item_total
        end

        order.subtotal_cents = subtotal_cents
        order.tax_cents = 0 # TODO: Calculate tax if needed
        order.total_cents = order.subtotal_cents + order.shipping_cost_cents + order.tax_cents

        order
      end

      def deduct_inventory(cart_items, order)
        cart_items.each do |item|
          variant = item.product_variant
          product = variant.product

          case product.inventory_level
          when "variant"
            # Decrement variant-level stock with audit trail
            variant.with_lock do
              previous_stock = variant.stock_quantity
              new_stock = previous_stock - item.quantity
              if new_stock < 0
                raise StandardError, "Not enough stock for #{variant.sku}"
              end
              variant.update!(stock_quantity: new_stock)

              # Create audit record inside the lock for atomicity
              InventoryAudit.record_order_placed(
                variant: variant,
                quantity: item.quantity,
                order: order,
                previous_qty: previous_stock
              )
            end

          when "product"
            # Decrement product-level stock with audit trail
            product.with_lock do
              previous_stock = product.product_stock_quantity || 0
              new_stock = previous_stock - item.quantity
              if new_stock < 0
                raise StandardError, "Not enough stock for #{product.name}"
              end
              product.update!(product_stock_quantity: new_stock)

              # Create audit record for product-level tracking
              InventoryAudit.record_product_stock_change(
                product: product,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Order ##{order.order_number} placed",
                audit_type: "order_placed",
                order: order
              )
            end

          when "none"
            # Do nothing - not tracking inventory
            next
          end
        end
      end

      def clear_cart(cart_items)
        cart_items.destroy_all
      end

      def order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          location: order.location ? { id: order.location.id, name: order.location.name, slug: order.location.slug } : nil,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          shipping_method: order.shipping_method,
          created_at: order.created_at.iso8601,
          item_count: order.order_items.count,
          order_items: order.order_items.map do |item|
            {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
          end
        }

        # Add shipping info for retail orders
        if order.order_type == "retail"
          json.merge!(
            shipping_address_line1: order.shipping_address_line1,
            shipping_address_line2: order.shipping_address_line2,
            shipping_city: order.shipping_city,
            shipping_state: order.shipping_state,
            shipping_zip: order.shipping_zip,
            shipping_country: order.shipping_country
          )
        end

        json
      end

      def detailed_order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          status_display: order.status&.titleize,
          payment_status: order.payment_status,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          location: order.location ? { id: order.location.id, name: order.location.name, slug: order.location.slug } : nil,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          total_formatted: "$#{'%.2f' % ((order.total_cents || 0) / 100.0)}",
          created_at: order.created_at.iso8601,
          shipping_method: order.shipping_method,
          order_items: order.order_items.map do |item|
            {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
          end
        }

        # Add shipping info for retail orders
        if order.order_type == "retail"
          json.merge!(
            shipping_address_line1: order.shipping_address_line1,
            shipping_address_line2: order.shipping_address_line2,
            shipping_city: order.shipping_city,
            shipping_state: order.shipping_state,
            shipping_zip: order.shipping_zip,
            shipping_country: order.shipping_country,
            tracking_number: order.tracking_number,
            tracking_url: tracking_url_for(order),
            can_track: order.tracking_number.present?
          )
        end

        json
      end

      def order_params
        params.require(:order).permit(
          :email, :phone, :payment_intent_id,
          :customer_name, :customer_email, :customer_phone,
          :fulfillment_type, :location_id,
          :shipping_address_line1, :shipping_address_line2,
          :shipping_city, :shipping_state, :shipping_zip, :shipping_country,
          shipping_address: [ :name, :street1, :street2, :city, :state, :zip, :country ],
          shipping_method: [ :carrier, :service, :rate_cents, :rate_id ],
          payment_method: [ :token, :type ]
        )
      end

      def order_update_params
        # Non-admin endpoint: customers can only update their own notes.
        # Status changes MUST go through admin/orders_controller#update
        # to ensure notifications are dispatched.
        params.require(:order).permit(:admin_notes)
      end

      # Generate tracking URL based on carrier
      def tracking_url_for(order)
        return nil unless order.tracking_number.present?

        tracking = order.tracking_number
        carrier = order.shipping_method&.downcase || ""

        if carrier.include?("usps")
          "https://tools.usps.com/go/TrackConfirmAction?tLabels=#{tracking}"
        elsif carrier.include?("ups")
          "https://www.ups.com/track?tracknum=#{tracking}"
        elsif carrier.include?("fedex")
          "https://www.fedex.com/fedextrack/?trknbr=#{tracking}"
        elsif carrier.include?("dhl")
          "https://www.dhl.com/en/express/tracking.html?AWB=#{tracking}"
        else
          # Generic - try USPS as default for Guam
          "https://tools.usps.com/go/TrackConfirmAction?tLabels=#{tracking}"
        end
      end

      # Verify a Stripe PaymentIntent was successful
      def verify_payment_intent(payment_intent_id, expected_amount_cents)
        settings = SiteSetting.instance

        if settings.payment_test_mode && payment_intent_id.start_with?("test_pi_")
          # Test mode: accept test payment intents
          return { success: true }
        end

        begin
          intent = Stripe::PaymentIntent.retrieve(payment_intent_id)

          unless intent.status == "succeeded"
            return { success: false, error: "Payment has not been completed (status: #{intent.status})" }
          end

          # Verify amount matches (allow small rounding differences)
          if (intent.amount - expected_amount_cents).abs > 1
            Rails.logger.warn "Payment amount mismatch: expected #{expected_amount_cents}, got #{intent.amount}"
            return { success: false, error: "Payment amount does not match order total" }
          end

          { success: true }
        rescue Stripe::InvalidRequestError => e
          Rails.logger.error "Invalid PaymentIntent ID: #{e.message}"
          { success: false, error: "Invalid payment reference" }
        rescue Stripe::StripeError => e
          Rails.logger.error "Stripe verification error: #{e.message}"
          { success: false, error: "Payment verification failed. Please try again." }
        end
      end

      # Support lookup by both numeric ID and order number (e.g., HAF-R-20251210-0001)
      def find_order_by_id_or_number(id_or_number)
        if id_or_number.to_s.match?(/\A\d+\z/)
          Order.includes(order_items: { product_variant: :product }).find(id_or_number)
        else
          Order.includes(order_items: { product_variant: :product }).find_by!(order_number: id_or_number)
        end
      end

      def authorize_order_access(order)
        # Admins can view any order
        return true if current_user&.admin?

        # Signed-in users can view their own orders. If an order was created as a guest
        # and later associated by email, allow that as well.
        if current_user
          owns_order = order.user_id == current_user.id
          email_matches = order.user_id.nil? &&
                          current_user.email.present? &&
                          order.customer_email.to_s.casecmp(current_user.email.to_s).zero?
          return true if owns_order || email_matches
        end

        # Guest access requires matching email to reduce order-number/ID enumeration risk.
        guest_email = params[:email].to_s.strip
        if guest_email.present? && order.customer_email.to_s.casecmp(guest_email).zero?
          return true
        end

        render json: { error: "Order not found" }, status: :not_found
        false
      end

      # Simplified order JSON for customer-facing order history
      def customer_order_json(order)
        {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          status_display: order.status&.titleize,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          order_type_display: order.order_type.titleize,
          total_cents: order.total_cents,
          total_formatted: "$#{'%.2f' % ((order.total_cents || 0) / 100.0)}",
          item_count: order.order_items.sum(:quantity),
          created_at: order.created_at.iso8601,
          created_at_display: order.created_at.strftime("%B %d, %Y"),
          # Tracking info (for shipped orders)
          tracking_number: order.tracking_number,
          shipping_method: order.shipping_method,
          # Status flags for UI
          can_track: order.tracking_number.present?,
          is_delivered: order.status == "delivered",
          is_cancelled: order.status == "cancelled",
          # Preview of items
          items_preview: order.order_items.first(3).map do |item|
            {
              product_name: item.product_name,
              variant_name: item.variant_name,
              quantity: item.quantity
            }
          end
        }
      end

      def normalized_fulfillment_type
        raw = order_params[:fulfillment_type].to_s
        return "pickup" if raw == "pickup"

        "shipping"
      end

      def pickup_location_id
        value = order_params[:location_id]
        return nil if value.blank?

        value.to_i
      end

      def apply_business_line_filter(relation, business_line)
        case business_line
        when "catering"
          relation.where(order_type: "wholesale")
        when "latte_stone"
          relation
            .where(order_type: "retail")
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .distinct
        when "three_squares"
          latte_stone_order_ids = Order
            .where(order_type: "retail")
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .select(:id)

          relation.where(order_type: "retail").where.not(id: latte_stone_order_ids)
        else
          relation
        end
      end

      def infer_business_line(order)
        return "catering" if order.order_type == "wholesale"
        return "three_squares" unless order.order_type == "retail"

        is_latte = order.order_items.any? do |item|
          item.product&.collections&.any? { |collection| COOKIE_COLLECTION_SLUGS.include?(collection.slug) }
        end

        is_latte ? "latte_stone" : "three_squares"
      end
    end
  end
end
