module Api
  module V1
    module Admin
      class CollectionsController < BaseController
        before_action :set_collection, only: [ :show, :update, :destroy ]

        # GET /api/v1/admin/collections
        def index
          @collections = Collection.order(sort_order: :asc, name: :asc)

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

          persist_collection!
          render_created(serialize_collection_with_products(@collection))
        rescue ActiveRecord::RecordInvalid => e
          render_error("Failed to create menu", errors: e.record.errors.full_messages)
        end

        # PATCH/PUT /api/v1/admin/collections/:id
        def update
          @collection.with_lock do
            @collection.assign_attributes(collection_params)
            persist_collection!
          end
          render_success(serialize_collection_with_products(@collection), message: "Menu updated successfully")
        rescue ActiveRecord::RecordInvalid => e
          render_error("Failed to update menu", errors: e.record.errors.full_messages)
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

        # Save schedule and ordered membership together. Membership is optional:
        # clients editing only metadata must never clear the existing menu.
        def persist_collection!
          Collection.transaction do
            ids = requested_product_ids
            @collection.save!
            unless ids.nil?
              @collection.product_collections.where.not(product_id: ids).destroy_all
              ids.each_with_index do |id, position|
                link = @collection.product_collections.find_or_initialize_by(product_id: id)
                link.update!(position: position)
              end
            end
          end
          @collection.reload
        end

        def requested_product_ids
          attrs = params.require(:collection)
          return nil unless attrs.key?(:product_ids)

          raw = attrs[:product_ids]
          valid = raw.is_a?(Array) && raw.size <= 2000 && raw.all? { |id| id.to_s.match?(/\A[1-9]\d*\z/) }
          ids = valid ? raw.map(&:to_i) : []
          valid &&= ids.uniq.size == ids.size && Product.where(id: ids).count == ids.size
          unless valid
            @collection.errors.add(:product_ids, "must be a unique list of existing menu items (up to 2000)")
            raise ActiveRecord::RecordInvalid, @collection
          end
          ids
        end

        def collection_params
          attributes = params.require(:collection).permit(
            :name,
            :slug,
            :description,
            :image_url,
            :published,
            :featured,
            :is_featured,
            :collection_type,
            :starts_at,
            :ends_at,
            :auto_hide,
            :banner_text,
            :sort_order,
            :meta_title,
            :meta_description
          )
          # Both API names control the existing featured flag, never two controls.
          attributes[:featured] = attributes[:is_featured] if !attributes.key?(:featured) && attributes.key?(:is_featured)
          attributes.delete(:is_featured)
          attributes
        end

        def serialize_collection(collection)
          at = Time.current
          {
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            description: collection.description,
            image_url: collection.image_url,
            published: collection.published,
            featured: collection.featured,
            is_featured: collection.featured,
            collection_type: collection.collection_type,
            starts_at: collection.starts_at&.in_time_zone&.iso8601,
            ends_at: collection.ends_at&.in_time_zone&.iso8601,
            auto_hide: collection.auto_hide,
            banner_text: collection.banner_text,
            available: collection.ordering_available?(at: at),
            availability_status: collection.availability_status(at: at),
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
            products: collection.products.includes(:product_images)
              .order(Arel.sql("product_collections.position ASC NULLS LAST"), :id)
              .map { |p| serialize_product_summary(p) }
          )
        end

        def serialize_product_summary(product)
          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            base_price_cents: product.base_price_cents,
            published: product.published,
            archived: product.archived,
            image_url: product.primary_image&.url
          }
        end
      end
    end
  end
end
