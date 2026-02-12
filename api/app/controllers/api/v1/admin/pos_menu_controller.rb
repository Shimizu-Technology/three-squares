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
          products = Product.published
            .includes(:product_variants, :product_images, :collections)

          # Filter by location if provided
          if params[:location_id].present?
            products = products.joins(:product_locations)
              .where(product_locations: { location_id: params[:location_id] })
          end

          # Filter by business line if provided
          if params[:business_line].present?
            products = products.where(business_line: params[:business_line])
          end

          # Group by collection (category)
          categories = {}
          products.order(:name).each do |product|
            collection_names = product.collections.pluck(:name)
            category = collection_names.first || "Uncategorized"

            categories[category] ||= []
            categories[category] << pos_product_json(product)
          end

          # Also return locations for the location picker
          locations = Location.all.order(:name).map { |l| { id: l.id, name: l.name, address: l.address } }

          render json: {
            categories: categories.map { |name, items| { name: name, items: items } },
            locations: locations,
            total_products: products.count
          }
        end

        private

        def pos_product_json(product)
          primary_image = product.product_images.find_by(primary: true) || product.product_images.first
          variants = product.product_variants.where(available: true).order(:position, :name)

          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            business_line: product.business_line,
            image_url: primary_image&.url,
            variants: variants.map do |v|
              {
                id: v.id,
                name: v.display_name,
                price_cents: v.price_cents,
                price_formatted: "$#{'%.2f' % (v.price_cents / 100.0)}",
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
