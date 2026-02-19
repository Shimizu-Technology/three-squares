module Api
  module V1
    module Admin
      class ProductImagesController < BaseController
        before_action :require_owner!
        before_action :set_product
        before_action :set_image, only: [ :show, :update, :destroy, :set_primary ]

        # GET /api/v1/admin/products/:product_id/images
        def index
          render_success(
            @product.product_images.by_position.map { |i| serialize_image(i) }
          )
        end

        # GET /api/v1/admin/products/:product_id/images/:id
        def show
          render_success(serialize_image(@image))
        end

        # POST /api/v1/admin/products/:product_id/images
        def create
          @image = @product.product_images.new(image_params)

          if @image.save
            render_created(serialize_image(@image))
          else
            render_error("Failed to add image", errors: @image.errors.full_messages)
          end
        end

        # PATCH/PUT /api/v1/admin/products/:product_id/images/:id
        def update
          if @image.update(image_params)
            render_success(serialize_image(@image), message: "Image updated successfully")
          else
            render_error("Failed to update image", errors: @image.errors.full_messages)
          end
        end

        # DELETE /api/v1/admin/products/:product_id/images/:id
        def destroy
          if @image.destroy
            render_success(nil, message: "Image deleted successfully")
          else
            render_error("Failed to delete image")
          end
        end

        # POST /api/v1/admin/products/:product_id/images/:id/set_primary
        def set_primary
          # Unset all other primary images for this product
          @product.product_images.where.not(id: @image.id).update_all(primary: false)

          if @image.update(primary: true)
            render_success(serialize_image(@image), message: "Primary image updated")
          else
            render_error("Failed to set primary image")
          end
        end

        # POST /api/v1/admin/products/:product_id/images/reorder
        def reorder
          positions = params[:positions] # Expected: { image_id: position }

          positions.each do |image_id, position|
            @product.product_images.find(image_id).update(position: position)
          end

          render_success(
            @product.product_images.by_position.map { |i| serialize_image(i) },
            message: "Images reordered successfully"
          )
        rescue => e
          render_error("Failed to reorder images", errors: [ e.message ])
        end

        private

        def set_product
          @product = Product.find_by(id: params[:product_id]) || Product.find_by(slug: params[:product_id])
          render_not_found("Product not found") unless @product
        end

        def set_image
          @image = @product.product_images.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render_not_found("Image not found")
        end

        def image_params
          params.require(:product_image).permit(
            :url,
            :s3_key,
            :alt_text,
            :position,
            :primary,
            :shopify_image_id
          )
        end

        def serialize_image(image)
          {
            id: image.id,
            product_id: image.product_id,
            url: image.signed_url, # Generate fresh signed URL on-demand
            s3_key: image.s3_key,
            alt_text: image.alt_text,
            position: image.position,
            primary: image.primary,
            shopify_image_id: image.shopify_image_id,
            created_at: image.created_at,
            updated_at: image.updated_at
          }
        end
      end
    end
  end
end
