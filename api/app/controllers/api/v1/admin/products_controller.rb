module Api
  module V1
    module Admin
      class ProductsController < BaseController
        before_action :set_product, only: [ :show, :update, :destroy ]

        # GET /api/v1/admin/products
        def index
          @products = Product.includes(:product_variants, :product_images, :collections, :product_locations)
                             .order(created_at: :desc)

          @products = @products.where(published: params[:published]) if params[:published].present?
          @products = @products.where(archived: params[:archived]) if params[:archived].present?
          @products = @products.active unless params[:show_archived] == "true"
          @products = @products.where(product_type: params[:product_type]) if params[:product_type].present?
          @products = @products.joins(:collections).where(collections: { id: params[:collection_id] }) if params[:collection_id].present?

          if params[:search].present?
            @products = @products.where("name ILIKE ? OR description ILIKE ?", "%#{params[:search]}%", "%#{params[:search]}%")
          end

          render_success(@products.map { |p| serialize_product_summary(p) })
        end

        # GET /api/v1/admin/products/:id
        def show
          render_success(serialize_product_full(@product))
        end

        # POST /api/v1/admin/products
        def create
          @product = Product.new(product_attributes)

          ActiveRecord::Base.transaction do
            @product.save!
            sync_product_locations(@product, permitted_location_ids)
            ensure_pickup_location_if_required!(@product)
          end

          @product.collection_ids = params[:collection_ids] if params[:collection_ids].present?
          render_created(serialize_product_full(@product))
        rescue ActiveRecord::RecordInvalid
          render_error("Failed to create product", errors: @product.errors.full_messages)
        end

        # PATCH/PUT /api/v1/admin/products/:id
        def update
          ActiveRecord::Base.transaction do
            @product.update!(product_attributes)
            sync_product_locations(@product, permitted_location_ids)
            ensure_pickup_location_if_required!(@product)
          end

          @product.collection_ids = params[:collection_ids] if params[:collection_ids].present?
          render_success(serialize_product_full(@product), message: "Product updated successfully")
        rescue ActiveRecord::RecordInvalid
          render_error("Failed to update product", errors: @product.errors.full_messages)
        end

        # DELETE /api/v1/admin/products/:id (Actually archives instead of deleting)
        def destroy
          if @product.archive!
            render_success(nil, message: "Product archived successfully")
          else
            render_error("Failed to archive product", errors: @product.errors.full_messages)
          end
        end

        # POST /api/v1/admin/products/:id/archive
        def archive
          @product = Product.find_by(id: params[:id])
          return render_not_found("Product not found") unless @product

          if @product.archive!
            render_success(serialize_product_summary(@product), message: "Product archived successfully")
          else
            render_error("Failed to archive product", errors: @product.errors.full_messages)
          end
        end

        # POST /api/v1/admin/products/:id/unarchive
        def unarchive
          @product = Product.find_by(id: params[:id])
          return render_not_found("Product not found") unless @product

          if @product.unarchive!
            render_success(serialize_product_summary(@product), message: "Product unarchived successfully")
          else
            render_error("Failed to unarchive product", errors: @product.errors.full_messages)
          end
        end

        # POST /api/v1/admin/products/:id/duplicate
        def duplicate
          @product = Product.find_by(id: params[:id])
          return render_not_found("Product not found") unless @product

          new_product = @product.dup
          new_product.name = "#{@product.name} (Copy)"
          new_product.slug = nil
          new_product.published = false

          if new_product.save
            @product.product_variants.each do |variant|
              new_variant = variant.dup
              new_variant.product = new_product
              new_variant.sku = nil
              new_variant.save
            end

            @product.product_images.each do |image|
              new_image = image.dup
              new_image.product = new_product
              new_image.save
            end

            new_product.collection_ids = @product.collection_ids
            sync_product_locations(new_product, @product.product_locations.available.pluck(:location_id))

            render_created(serialize_product_full(new_product), message: "Product duplicated successfully")
          else
            render_error("Failed to duplicate product", errors: new_product.errors.full_messages)
          end
        end

        private

        def set_product
          @product = Product.includes(:product_variants, :product_images, :collections, :product_locations)
                            .find_by(id: params[:id]) ||
                     Product.includes(:product_variants, :product_images, :collections, :product_locations)
                            .find_by(slug: params[:id])
          render_not_found("Product not found") unless @product
        end

        def product_attributes
          product_params.except(:location_ids)
        end

        def permitted_location_ids
          raw_ids = product_params[:location_ids]
          return nil unless raw_ids.is_a?(Array)

          raw_ids.map(&:to_i).uniq
        end

        def sync_product_locations(product, location_ids)
          return unless location_ids

          Location.find_each do |location|
            record = product.product_locations.find_or_initialize_by(location_id: location.id)
            record.available = location_ids.include?(location.id)
            record.save!
          end
        end

        def ensure_pickup_location_if_required!(product)
          return unless product.allow_pickup?
          return if product.product_locations.available.exists?

          product.errors.add(:base, "Select at least one pickup location for pickup-enabled products.")
          raise ActiveRecord::RecordInvalid, product
        end

        def product_params
          params.require(:product).permit(
            :name,
            :slug,
            :description,
            :base_price_cents,
            :sale_price_cents,
            :new_product,
            :sku_prefix,
            :track_inventory,
            :inventory_level,
            :product_stock_quantity,
            :product_low_stock_threshold,
            :weight_oz,
            :published,
            :featured,
            :product_type,
            :vendor,
            :meta_title,
            :meta_description,
            :shopify_product_id,
            :allow_pickup,
            :allow_shipping,
            collection_ids: [],
            location_ids: []
          )
        end

        def serialize_product_summary(product)
          total_variant_stock = if product.inventory_level == "variant"
            product.product_variants.sum(:stock_quantity)
          end

          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            base_price_cents: product.base_price_cents,
            sale_price_cents: product.sale_price_cents,
            new_product: product.new_product,
            sku_prefix: product.sku_prefix,
            published: product.published,
            featured: product.featured,
            archived: product.archived,
            product_type: product.product_type,
            track_inventory: product.track_inventory,
            inventory_level: product.inventory_level,
            allow_pickup: product.allow_pickup,
            allow_shipping: product.allow_shipping,
            location_ids: product.product_locations.available.pluck(:location_id),
            product_stock_quantity: product.product_stock_quantity,
            product_low_stock_threshold: product.product_low_stock_threshold,
            product_stock_status: product.product_stock_status,
            product_low_stock: product.product_low_stock?,
            total_variant_stock: total_variant_stock,
            primary_image_url: product.primary_image&.signed_url,
            variant_count: product.product_variants.count,
            in_stock: product.in_stock?,
            actually_available: product.actually_available?,
            collections: product.collections.map { |c| { id: c.id, name: c.name, slug: c.slug } },
            needs_attention: product.needs_attention,
            import_notes: product.import_notes,
            created_at: product.created_at,
            updated_at: product.updated_at
          }
        end

        def serialize_product_full(product)
          serialize_product_summary(product).merge(
            description: product.description,
            weight_oz: product.weight_oz,
            vendor: product.vendor,
            meta_title: product.meta_title,
            meta_description: product.meta_description,
            shopify_product_id: product.shopify_product_id,
            collection_ids: product.collections.pluck(:id),
            locations: Location.by_name.map { |location| serialize_product_location(location, product) },
            variants: product.product_variants.map { |v| serialize_variant(v) },
            images: product.product_images.by_position.map { |i| serialize_image(i) }
          )
        end

        def serialize_product_location(location, product)
          product_location = product.product_locations.find { |pl| pl.location_id == location.id }
          {
            id: location.id,
            name: location.name,
            slug: location.slug,
            available: product_location&.available || false
          }
        end

        def serialize_variant(variant)
          {
            id: variant.id,
            options: variant.options,
            size: variant.size,
            color: variant.color,
            variant_key: variant.variant_key,
            variant_name: variant.variant_name,
            sku: variant.sku,
            price_cents: variant.price_cents,
            stock_quantity: variant.stock_quantity,
            low_stock_threshold: variant.low_stock_threshold,
            available: variant.available,
            actually_available: variant.actually_available?,
            weight_oz: variant.weight_oz,
            shopify_variant_id: variant.shopify_variant_id,
            barcode: variant.barcode
          }
        end

        def serialize_image(image)
          {
            id: image.id,
            url: image.signed_url,
            alt_text: image.alt_text,
            position: image.position,
            primary: image.primary,
            shopify_image_id: image.shopify_image_id
          }
        end
      end
    end
  end
end
