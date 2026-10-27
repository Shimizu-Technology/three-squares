require "csv"

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
            sync_product_locations(@product, permitted_location_ids, new_product: true)
            ensure_pickup_location_if_required!(@product)
          end

          @product.collection_ids = params[:collection_ids] if params[:collection_ids].present?
          render_created(serialize_product_full(@product))
        rescue ActiveRecord::RecordInvalid => error
          render_error("Failed to create product", errors: error.record.errors.full_messages)
        end

        # PATCH/PUT /api/v1/admin/products/:id
        def update
          ActiveRecord::Base.transaction do
            @product.lock!
            @product.update!(product_attributes)
            sync_product_locations(@product, permitted_location_ids)
            ensure_pickup_location_if_required!(@product)
          end

          @product.collection_ids = params[:collection_ids] if params[:collection_ids].present?
          render_success(serialize_product_full(@product), message: "Product updated successfully")
        rescue ActiveRecord::RecordInvalid => error
          render_error("Failed to update product", errors: error.record.errors.full_messages)
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
            source_ids = @product.product_locations.exists? ? @product.product_locations.available.pluck(:location_id) : Location.ids
            sync_product_locations(new_product, source_ids & staff_access_policy.authorized_location_ids, new_product: true)

            render_created(serialize_product_full(new_product), message: "Product duplicated successfully")
          else
            render_error("Failed to duplicate product", errors: new_product.errors.full_messages)
          end
        end

        # POST /api/v1/admin/products/import_csv
        # Valid rows commit independently; invalid rows never leave partial products/categories.
        def import_csv
          file = params[:file]
          unless file.is_a?(ActionDispatch::Http::UploadedFile)
            return render json: { error: "CSV file is required" }, status: :unprocessable_entity
          end

          csv_text = file.read(2.megabytes + 1).force_encoding("UTF-8")
          if csv_text.bytesize > 2.megabytes
            return render json: { error: "CSV file must be 2 MB or smaller" }, status: :unprocessable_entity
          end
          unless csv_text.valid_encoding?
            return render json: { error: "CSV file must use UTF-8 encoding" }, status: :unprocessable_entity
          end
          csv_text = csv_text.delete_prefix("\uFEFF")
          rows = CSV.parse(csv_text, headers: true, skip_blanks: true,
                           header_converters: ->(header) { header&.strip&.downcase })
          headers = rows.headers
          unless %w[name price].all? { |header| headers.include?(header) } && headers.compact.uniq.size == headers.size
            return render json: { error: "CSV requires unique name and price headers" }, status: :unprocessable_entity
          end
          if rows.empty? || rows.size > 2000
            return render json: { error: "CSV must contain 1 to 2000 product rows" }, status: :unprocessable_entity
          end

          imported = 0
          errors = []
          notices = []
          # An exact slug wins; otherwise a case-insensitive slug or name only
          # resolves when it identifies exactly one location.
          all_locations = Location.all.to_a
          locations_by_exact_slug = all_locations.index_by(&:slug)
          locations_by_slug = all_locations.group_by { |location| location.slug.to_s.downcase }
          locations_by_name = all_locations.group_by { |location| location.name.to_s.downcase }
          unique_match = ->(matches) { matches&.one? ? matches.first : nil }
          rows.each_with_index do |row, index|
            name = row["name"]&.strip
            price = row["price"]&.strip
            active = row["active"]&.strip&.downcase
            location_keys = row["locations"].to_s.split(/[;|]/).map(&:strip).reject(&:empty?)
            resolved_locations = location_keys.map do |key|
              folded = key.downcase
              locations_by_exact_slug[key] ||
                unique_match.call(locations_by_slug[folded]) ||
                (locations_by_slug.key?(folded) ? nil : unique_match.call(locations_by_name[folded]))
            end
            unknown_locations = location_keys.zip(resolved_locations).filter_map { |key, location| key if location.nil? }
            error = if row.fields.any? { |value| value.to_s.include?("\u0000") }
              "Row contains an invalid null character"
            elsif name.blank?
              "Name is required"
            elsif !price&.match?(/\A\d+(?:\.\d{1,2})?\z/) || BigDecimal(price) * 100 > 2_147_483_647
              "Price must be a nonnegative amount with at most two decimal places"
            elsif active.present? && !%w[true 1 yes false 0 no].include?(active)
              "Active must be true or false (yes/no and 1/0 are also accepted)"
            elsif unknown_locations.any?
              "Unknown or ambiguous location: #{unknown_locations.join(', ')}. Use the location slug."
            end
            if error
              errors << { row: index + 2, name: name, error: error }
              next
            end

            begin
              pickup_location_ids = resolved_locations.map(&:id).uniq
              wants_published = !%w[false 0 no].include?(active)
              Product.transaction(requires_new: true) do
                # A pickup product with no location rows counts as available everywhere,
                # so rows without locations are imported as unpublished drafts.
                product = Product.create!(
                  name: name, description: row["description"]&.strip.presence,
                  base_price_cents: (BigDecimal(price) * 100).to_i,
                  published: wants_published && pickup_location_ids.any?,
                  allow_pickup: true, allow_shipping: false, inventory_level: "none"
                )
                sync_product_locations(product, pickup_location_ids, new_product: true) if pickup_location_ids.any?
                unless product.product_variants.exists?
                  product.errors.add(:base, "Default variant could not be created")
                  raise ActiveRecord::RecordInvalid, product
                end
                category = row["category_name"]&.strip
                if category.present?
                  collection = Collection.find_or_create_by!(name: category) { |c| c.published = true }
                  product.collections << collection
                end
              end
              imported += 1
              if wants_published && pickup_location_ids.empty?
                notices << { row: index + 2, name: name,
                             message: "Imported as a draft. Assign pickup locations, then publish it." }
              end
            rescue ActiveRecord::RecordInvalid => e
              errors << { row: index + 2, name: name, error: e.record.errors.full_messages.join(", ") }
            rescue ActiveRecord::RecordNotUnique
              errors << { row: index + 2, name: name, error: "Product or category already exists" }
            end
          end

          render_success({ imported: imported, skipped: errors.size, total: rows.size, errors: errors, notices: notices })
        rescue CSV::MalformedCSVError
          render json: { error: "Invalid CSV format" }, status: :unprocessable_entity
        end

        # A deliberately narrow local86 operation, separate from catalog editing
        # and shared stock. The later packing/POS slice supplies its fast UI.
        def availability
          attrs = params.require(:availability)
          unless (attrs.keys - %w[location_id available]).empty? && [true, false].include?(attrs[:available])
            return render_error("Supply only a location and a boolean available value", status: :unprocessable_entity)
          end
          return staff_record_missing! unless staff_access_policy.location_allowed?(attrs[:location_id])

          product = Product.find(params[:id])
          product.with_lock do
            # No rows means available everywhere. Materialize that existing
            # meaning first so the first local86 cannot hide another location.
            unless product.product_locations.exists?
              Location.find_each { |location| product.product_locations.create!(location: location, available: true) }
            end
            record = product.product_locations.find_or_initialize_by(location_id: attrs[:location_id])
            record.available = attrs[:available]
            record.save!
          end
          render_success({ product_id: product.id, location_id: attrs[:location_id].to_i, available: attrs[:available] })
        rescue ActiveRecord::RecordNotFound
          render_not_found("Product not found")
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

        def sync_product_locations(product, location_ids, new_product: false)
          return unless location_ids

          authorized_ids = staff_access_policy.authorized_location_ids
          had_rows = product.product_locations.exists?
          existing_ids = had_rows ? product.product_locations.available.pluck(:location_id) : Location.ids
          # Catalog editing is global; local availability is scoped separately.
          # A full editor payload may retain other locations, but cannot change them.
          changed_ids = (location_ids - existing_ids) + (existing_ids - location_ids)
          unauthorized_changes = new_product ? (location_ids - authorized_ids) : (changed_ids - authorized_ids)
          if unauthorized_changes.any?
            product.errors.add(:base, "Pickup availability changes are outside your authorized locations")
            raise ActiveRecord::RecordInvalid, product
          end
          Location.find_each do |location|
            next if had_rows && !authorized_ids.include?(location.id)
            record = product.product_locations.find_or_initialize_by(location_id: location.id)
            record.available = if !new_product && !had_rows && !authorized_ids.include?(location.id)
              true
            else
              location_ids.include?(location.id)
            end
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
            location_ids: product.product_locations.exists? ? product.product_locations.available.pluck(:location_id) : Location.ids,
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
