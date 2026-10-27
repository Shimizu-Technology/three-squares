module Api
  module V1
    class CollectionsController < ApplicationController
      before_action :set_menu_time
      before_action :set_collection, only: [ :show ]

      # GET /api/v1/collections
      def index
        @collections = Collection.visible_at(@menu_time).for_enabled_storefronts
                                 .includes(:products)

        # Search by name or description
        if params[:search].present?
          @collections = @collections.where("collections.name ILIKE ? OR collections.description ILIKE ?",
                                           "%#{params[:search]}%", "%#{params[:search]}%")
        end

        # Order by position, then name
        @collections = @collections.by_position

        # Pagination
        page = params[:page]&.to_i || 1
        per_page = [ params[:per_page]&.to_i || 12, 50 ].min # Max 50 per page

        # Get total count BEFORE pagination
        total_count = @collections.count

        # Apply pagination
        @collections = @collections.limit(per_page).offset((page - 1) * per_page)

        render json: {
          collections: @collections.map { |c| serialize_collection(c) },
          meta: {
            page: page,
            per_page: per_page,
            total: total_count
          }
        }
      end

      # GET /api/v1/collections/:id
      def show
        page = params[:page]&.to_i || 1
        per_page = [ params[:per_page]&.to_i || 12, 50 ].min

        products = orderable_products(@collection)
                             .includes(:product_variants, :product_images)
                             .order(featured: :desc, created_at: :desc)

        # Filter by location if provided
        if params[:location_id].present?
          products = products.joins(:product_locations)
            .where(product_locations: { location_id: params[:location_id].to_i, available: true })
            .distinct
        end

        # Apply filters if provided
        products = products.where(product_type: params[:product_type]) if params[:product_type].present?

        # Search within collection
        if params[:search].present?
          products = products.where("products.name ILIKE ? OR products.description ILIKE ?",
                                   "%#{params[:search]}%", "%#{params[:search]}%")
        end

        # Pagination
        total_count = products.count
        products = products.limit(per_page).offset((page - 1) * per_page)

        render json: {
          collection: serialize_collection_full(@collection),
          products: products.map { |p| serialize_product(p) },
          meta: {
            page: page,
            per_page: per_page,
            total: total_count
          }
        }
      end

      private

      def set_menu_time
        @menu_time = Time.current
      end

      def orderable_products(collection)
        return collection.products.none unless collection.ordering_available?(at: @menu_time)

        MenuEligibility.scope(StorefrontEligibility.scope(collection.products.published.active), at: @menu_time)
      end

      def set_collection
        @collection = Collection.visible_at(@menu_time).for_enabled_storefronts
                                .includes(:products)
                                .find_by(id: params[:id]) ||
                      Collection.visible_at(@menu_time).for_enabled_storefronts
                                .includes(:products)
                                .find_by(slug: params[:id])

        render json: { error: "Collection not found" }, status: :not_found unless @collection
      end

      def serialize_collection(collection)
        # Get first product's primary image as thumbnail
        visible_products = orderable_products(collection)
        first_product = visible_products.includes(:product_images).first
        thumbnail_url = first_product&.primary_image&.signed_url

        {
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          business_line: collection.storefront_key,
          description: collection.description,
          image_url: collection.image_url,
          featured: collection.featured,
          is_featured: collection.featured,
          collection_type: collection.collection_type,
          starts_at: collection.starts_at&.in_time_zone&.iso8601,
          ends_at: collection.ends_at&.in_time_zone&.iso8601,
          auto_hide: collection.auto_hide,
          banner_text: collection.banner_text,
          available: collection.ordering_available?(at: @menu_time),
          availability_status: collection.availability_status(at: @menu_time),
          product_count: visible_products.count,
          thumbnail_url: thumbnail_url
        }
      end

      def serialize_collection_full(collection)
        serialize_collection(collection).merge(
          meta_title: collection.meta_title,
          meta_description: collection.meta_description
        )
      end

      def serialize_product(product)
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description&.truncate(200),
          base_price_cents: product.base_price_cents,
          sale_price_cents: product.sale_price_cents,
          new_product: product.new_product,
          featured: product.featured,
          product_type: product.product_type,
          actually_available: product.actually_available?,
          primary_image_url: product.primary_image&.signed_url,
          variant_count: product.product_variants.count
        }
      end
    end
  end
end
