module Api
  module V1
    module Admin
      class CollectionsController < BaseController
        before_action :require_owner!
        before_action :set_collection, only: [ :show, :update, :destroy ]

        # GET /api/v1/admin/collections
        def index
          @collections = Collection.order(sort_order: :asc, name: :asc)
          @collections = @collections.by_business_line(params[:business_line]) if params[:business_line].present?

          render_success(
            @collections.map { |c| serialize_collection(c) }
          )
        end

        # GET /api/v1/admin/collections/:id
        def show
          render_success(serialize_collection_with_products(@collection))
        end

        # POST /api/v1/admin/collections
        def create
          @collection = Collection.new(collection_params)

          if @collection.save
            render_created(serialize_collection(@collection))
          else
            render_error("Failed to create collection", errors: @collection.errors.full_messages)
          end
        end

        # PATCH/PUT /api/v1/admin/collections/:id
        def update
          if @collection.update(collection_params)
            render_success(serialize_collection(@collection), message: "Collection updated successfully")
          else
            render_error("Failed to update collection", errors: @collection.errors.full_messages)
          end
        end

        # DELETE /api/v1/admin/collections/:id
        def destroy
          if @collection.destroy
            render_success(nil, message: "Collection deleted successfully")
          else
            render_error("Failed to delete collection", errors: @collection.errors.full_messages)
          end
        end

        private

        def set_collection
          @collection = Collection.find_by(id: params[:id]) || Collection.find_by(slug: params[:id])
          render_not_found("Collection not found") unless @collection
        end

        def collection_params
          params.require(:collection).permit(
            :name,
            :slug,
            :description,
            :image_url,
            :published,
            :featured,
            :sort_order,
            :meta_title,
            :meta_description,
            :business_line
          )
        end

        def serialize_collection(collection)
          {
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            business_line: collection.business_line,
            description: collection.description,
            image_url: collection.image_url,
            published: collection.published,
            featured: collection.featured,
            sort_order: collection.sort_order,
            product_count: collection.products.count,
            meta_title: collection.meta_title,
            meta_description: collection.meta_description,
            created_at: collection.created_at,
            updated_at: collection.updated_at
          }
        end

        def serialize_collection_with_products(collection)
          serialize_collection(collection).merge(
            products: collection.products.published.map { |p| serialize_product_summary(p) }
          )
        end

        def serialize_product_summary(product)
          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            base_price_cents: product.base_price_cents,
            published: product.published,
            image_url: product.primary_image&.url
          }
        end
      end
    end
  end
end
