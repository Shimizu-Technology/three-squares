module Api
  module V1
    class CollectionsController < ApplicationController
      before_action :set_collection, only: [ :show ]

      # GET /api/v1/collections
      def index
        @collections = Collection.customer_visible
                                 .includes(:products)

        # Filter by featured
        if params[:featured].present?
          @collections = @collections.is_featured
        end

        # Search by name or description
        if params[:search].present?
          @collections = @collections.where("collections.name ILIKE ? OR collections.description ILIKE ?",
                                           "%#{params[:search]}%", "%#{params[:search]}%")
        end

        # Order by position, then name
        @collections = @collections.by_position

        # Pagination
        page = params[:page]&.to_i || 1
        per_page = [ params[:per_page]&.to_i || 12, 50 ].min

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

        products = @collection.products.published.active
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

      def set_collection
        @collection = Collection.customer_visible
                                .includes(:products)
                                .find_by(id: params[:id]) ||
                      Collection.customer_visible
                                .includes(:products)
                                .find_by(slug: params[:id])

        render json: { error: "Collection not found" }, status: :not_found unless @collection
      end

      def serialize_collection(collection)
        # Get first product's primary image as thumbnail
        first_product = collection.products.published.includes(:product_images).first
        thumbnail_url = first_product&.primary_image&.signed_url

        {
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description,
          image_url: collection.image_url,
          featured: collection.featured,
          product_count: collection.products.published.active.count,
          thumbnail_url: thumbnail_url,
          collection_type: collection.collection_type,
          starts_at: collection.starts_at&.iso8601,
          ends_at: collection.ends_at&.iso8601,
          is_featured: collection.is_featured,
          banner_text: collection.banner_text
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
