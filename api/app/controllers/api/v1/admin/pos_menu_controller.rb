# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PosMenuController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!

        # GET /api/v1/admin/pos/menu
        # Returns products grouped by category with variants, optimized for POS display
        def show
          if params[:location_id].present? && !staff_access_policy.location_allowed?(params[:location_id])
            return staff_record_missing!
          end
          include_unavailable = params[:include_unavailable] == "true"
          return unless !include_unavailable || require_staff_capability!("availability.manage")
          products = MenuEligibility.scope(StorefrontEligibility.scope(Product.published.active.where(allow_pickup: true)))
            .includes(:product_variants, :product_images, :collections, :product_locations)

          # Filter by location — auto-scope for location-locked staff
          effective_location_id = if current_user.location_scoped?
            current_user.assigned_location_id
          elsif params[:location_id].present?
            params[:location_id].to_i
          end

          if effective_location_id && !include_unavailable
            products = products.where.not(id: ProductLocation.select(:product_id))
              .or(products.where(id: ProductLocation.where(location_id: effective_location_id, available: true).select(:product_id)))
              .distinct
          end

          # Filter by product type if provided
          if params[:product_type].present?
            products = products.where(product_type: params[:product_type])
          end

          # Stock capacity is advisory; sale reservation remains authoritative.
          products = products.order(:name).to_a
          held = InventoryReservation.where(state: "held").where("expires_at > ?", Time.current)
          pools = held.where(pool_type: "Product", pool_id: products.map(&:id))
            .or(held.where(pool_type: "ProductVariant", pool_id: products.flat_map { |product| product.product_variants.map(&:id) }))
          @held_quantities = pools.group(:pool_type, :pool_id).sum(:quantity)

          # Group by collection (category)
          categories = {}
          products.each do |product|
            serialized = pos_product_json(product, effective_location_id)
            next if serialized[:variants].empty?
            collection_names = product.collections.map(&:name)
            category = collection_names.first || "Uncategorized"

            categories[category] ||= []
            categories[category] << serialized
          end

          # Also return locations for the location picker
          locations = staff_access_policy.location_choices

          render json: {
            categories: categories.map { |name, items| { name: name, items: items } },
            locations: locations,
            total_products: categories.values.sum(&:size)
          }
        end

        private

        def pos_product_json(product, effective_location_id)
          primary_image = product.product_images.find(&:primary?) || product.product_images.first
          variants = product.product_variants.select(&:available?).sort_by { |variant| variant.variant_name.to_s }
          local_rows = product.product_locations.to_a
          location_available = effective_location_id.nil? || local_rows.empty? || local_rows.any? { |row| row.location_id == effective_location_id && row.available? }

          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            product_type: product.product_type,
            location_available: location_available,
            image_url: primary_image&.url,
            variants: variants.filter_map do |v|
              price = CatalogPrice.resolve(product: product, variant: v, location_id: effective_location_id)
              next unless price.purchasable
              pool_type, pool_id, stock = case product.inventory_level
              when "product" then [ "Product", product.id, product.product_stock_quantity ]
              when "variant" then [ "ProductVariant", v.id, v.stock_quantity ]
              else [ nil, nil, nil ]
              end
              capacity = pool_type ? [ stock.to_i - @held_quantities.fetch([ pool_type, pool_id ], 0), 0 ].max : nil
              {
                id: v.id,
                name: v.display_name,
                price_cents: price.unit_price_cents,
                price_formatted: "$#{'%.2f' % (price.unit_price_cents / 100.0)}",
                sku: v.sku,
                in_stock: location_available && (capacity.nil? || capacity.positive?),
                stock_quantity: v.stock_quantity,
                inventory_pool_key: pool_type ? "#{pool_type}:#{pool_id}" : nil,
                available_quantity: capacity
              }
            end
          }
        end
      end
    end
  end
end
