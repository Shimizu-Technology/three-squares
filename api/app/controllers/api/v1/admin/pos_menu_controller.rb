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
          products = MenuEligibility.scope(StorefrontEligibility.scope(Product.published))
            .includes(:product_variants, :product_images, :collections)

          # Filter by location — auto-scope for location-locked staff
          effective_location_id = if current_user.location_scoped?
            current_user.assigned_location_id
          elsif params[:location_id].present?
            params[:location_id].to_i
          end

          if effective_location_id
            products = products.where.not(id: ProductLocation.select(:product_id))
              .or(products.where(id: ProductLocation.where(location_id: effective_location_id, available: true).select(:product_id)))
              .distinct
          end

          # Filter by product type if provided
          if params[:product_type].present?
            products = products.where(product_type: params[:product_type])
          end

          # Group by collection (category)
          categories = {}
          products.order(:name).each do |product|
            next unless CatalogPrice.resolve(product: product, location_id: effective_location_id).purchasable
            collection_names = product.collections.map(&:name)
            category = collection_names.first || "Uncategorized"

            categories[category] ||= []
            categories[category] << pos_product_json(product, effective_location_id)
          end

          # Also return locations for the location picker
          locations = Location.all.order(:name).map { |l| { id: l.id, name: l.name, address: l.address } }

          render json: {
            categories: categories.map { |name, items| { name: name, items: items } },
            locations: locations,
            total_products: categories.values.sum(&:size)
          }
        end

        private

        def pos_product_json(product, effective_location_id)
          primary_image = product.product_images.find_by(primary: true) || product.product_images.first
          variants = product.product_variants.where(available: true).order(:variant_name)

          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            product_type: product.product_type,
            image_url: primary_image&.url,
            variants: variants.filter_map do |v|
              price = CatalogPrice.resolve(product: product, variant: v, location_id: effective_location_id)
              next unless price.purchasable
              {
                id: v.id,
                name: v.display_name,
                price_cents: price.unit_price_cents,
                price_formatted: "$#{'%.2f' % (price.unit_price_cents / 100.0)}",
                sku: v.sku,
                in_stock: v.in_stock?,
                stock_quantity: v.stock_quantity
              }
            end
          }
        end
      end
    end
  end
end
