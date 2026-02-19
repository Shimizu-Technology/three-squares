module Api
  module V1
    module Admin
      class ProductVariantsController < BaseController
        before_action :require_owner!
        before_action :set_product
        before_action :set_variant, only: [ :show, :update, :destroy ]

        # GET /api/v1/admin/products/:product_id/variants
        def index
          render_success(
            @product.product_variants.map { |v| serialize_variant(v) }
          )
        end

        # GET /api/v1/admin/products/:product_id/variants/:id
        def show
          render_success(serialize_variant(@variant))
        end

        # POST /api/v1/admin/products/:product_id/variants
        def create
          @variant = @product.product_variants.new(variant_params)

          if @variant.save
            render_created(serialize_variant(@variant))
          else
            render_error("Failed to create variant", errors: @variant.errors.full_messages)
          end
        end

        # PATCH/PUT /api/v1/admin/products/:product_id/variants/:id
        def update
          # Track stock changes for audit trail
          previous_stock = @variant.stock_quantity

          if @variant.update(variant_params)
            # Create inventory audit if stock changed
            new_stock = @variant.stock_quantity
            if previous_stock != new_stock && @product.inventory_level == "variant"
              InventoryAudit.record_manual_adjustment(
                variant: @variant,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Manual stock update via admin",
                user: current_user
              )
            end

            render_success(serialize_variant(@variant), message: "Variant updated successfully")
          else
            render_error("Failed to update variant", errors: @variant.errors.full_messages)
          end
        end

        # DELETE /api/v1/admin/products/:product_id/variants/:id
        def destroy
          if @variant.destroy
            render_success(nil, message: "Variant deleted successfully")
          else
            render_error("Failed to delete variant", errors: @variant.errors.full_messages)
          end
        end

        # POST /api/v1/admin/products/:product_id/variants/:id/adjust_stock
        def adjust_stock
          @variant = @product.product_variants.find(params[:id])
          adjustment = params[:adjustment].to_i
          reason = params[:reason] || "Manual stock adjustment"

          if adjustment == 0
            return render_error("Adjustment must be non-zero")
          end

          previous_stock = @variant.stock_quantity

          if adjustment > 0
            @variant.increment_stock!(adjustment)
            message = "Added #{adjustment} units to stock"
            audit_type = "restock"
          else
            @variant.decrement_stock!(adjustment.abs)
            message = "Removed #{adjustment.abs} units from stock"
            audit_type = "manual_adjustment"
          end

          # Create inventory audit record
          if @product.inventory_level == "variant"
            InventoryAudit.record_manual_adjustment(
              variant: @variant,
              previous_qty: previous_stock,
              new_qty: @variant.stock_quantity,
              reason: reason,
              user: current_user
            )
          end

          render_success(serialize_variant(@variant), message: message)
        rescue => e
          render_error("Failed to adjust stock", errors: [ e.message ])
        end

        # POST /api/v1/admin/products/:product_id/variants/generate
        # Supports two formats:
        # 1. Legacy: { sizes: [...], colors: [...] }
        # 2. Flexible: { option_types: { "Size": [...], "Color": [...], "Material": [...] } }
        def generate
          # Check if using new flexible format
          if params[:option_types].present?
            generate_from_option_types
          else
            generate_from_legacy_params
          end
        rescue => e
          render_error("Failed to generate variants", errors: [ e.message ])
        end

        # POST /api/v1/admin/products/:product_id/variants/auto_detect_options
        # Attempts to infer missing option labels (ex: Size) from SKU/variant name
        def auto_detect_options
          updated = 0
          skipped = 0

          @product.product_variants.find_each do |variant|
            options = variant.options.presence || {}
            next if options["Size"].present? || options["size"].present?

            candidate = variant.size.presence || variant.variant_name.presence || variant.sku.to_s
            size = ProductVariant.extract_size_from_text(candidate)

            if size.blank?
              skipped += 1
              next
            end

            options["Size"] = size
            variant.update!(
              options: options,
              size: size,
              variant_key: nil,
              variant_name: nil
            )
            updated += 1
          end

          render_success(
            {
              updated: updated,
              skipped: skipped,
              variants: @product.product_variants.reload.map { |v| serialize_variant(v) }
            },
            message: "Updated #{updated} variant#{'s' unless updated == 1}"
          )
        rescue => e
          render_error("Failed to auto-detect options", errors: [ e.message ])
        end

        private

        def set_product
          @product = Product.find_by(id: params[:product_id]) || Product.find_by(slug: params[:product_id])
          render_not_found("Product not found") unless @product
        end

        def set_variant
          @variant = @product.product_variants.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render_not_found("Variant not found")
        end

        # ==========================================
        # Flexible Option Types Generation (NEW)
        # ==========================================

        def generate_from_option_types
          option_types = params[:option_types]

          if option_types.blank? || option_types.empty?
            return render_error("At least one option type with values must be provided")
          end

          # Parse and validate option types
          # Format: { "Size": [{ "name": "M", "price_adjustment_cents": 0 }, ...], "Color": [...] }
          parsed_options = {}
          option_types.each do |type_name, values|
            if values.blank? || values.empty?
              return render_error("Option type '#{type_name}' must have at least one value")
            end

            parsed_options[type_name] = values.map do |v|
              # Handle both Hash and ActionController::Parameters
              if v.respond_to?(:key?)
                {
                  name: v[:name] || v["name"],
                  price_adjustment_cents: (v[:price_adjustment_cents] || v["price_adjustment_cents"] || 0).to_i
                }
              else
                { name: v.to_s, price_adjustment_cents: 0 }
              end
            end
          end

          # Generate all combinations (cartesian product)
          combinations = cartesian_product(parsed_options)

          variants_created = 0
          variants_skipped = 0
          errors = []

          combinations.each do |combination|
            result = create_variant_from_options(combination)
            if result[:created]
              variants_created += 1
            else
              variants_skipped += 1
            end
            errors << result[:error] if result[:error]
          end

          message = "Generated #{variants_created} new variant#{'s' unless variants_created == 1}"
          message += " (#{variants_skipped} skipped - already exist)" if variants_skipped > 0

          render_success(
            {
              variants: @product.product_variants.reload.map { |v| serialize_variant(v) },
              created: variants_created,
              skipped: variants_skipped,
              total_combinations: combinations.length,
              errors: errors
            },
            message: message
          )
        end

        # Generate cartesian product of all option types
        # Input: { "Size" => [{name: "M", ...}, ...], "Color" => [...] }
        # Output: Array of hashes like [{ options: { "Size" => "M", "Color" => "Black" }, total_adjustment: 200 }, ...]
        def cartesian_product(parsed_options)
          option_type_names = parsed_options.keys
          return [] if option_type_names.empty?

          # Start with first option type
          first_type = option_type_names.first
          combinations = parsed_options[first_type].map do |value|
            {
              options: { first_type => value[:name] },
              total_adjustment: value[:price_adjustment_cents]
            }
          end

          # Add each subsequent option type
          option_type_names[1..-1].each do |type_name|
            new_combinations = []
            combinations.each do |existing|
              parsed_options[type_name].each do |value|
                new_combinations << {
                  options: existing[:options].merge(type_name => value[:name]),
                  total_adjustment: existing[:total_adjustment] + value[:price_adjustment_cents]
                }
              end
            end
            combinations = new_combinations
          end

          combinations
        end

        # Create variant from flexible options hash
        def create_variant_from_options(combination)
          options = combination[:options]
          price_adjustment = combination[:total_adjustment]

          # Check if this combination already exists (using options JSONB)
          existing = @product.product_variants.find_by(options: options)
          return { created: false, variant: existing } if existing

          # Generate variant key from options
          variant_key = options.values.map { |v| v.to_s.parameterize }.join("-")

          # Generate display name
          variant_name = options.values.join(" / ")

          # Generate SKU
          sku_parts = [ @product.sku_prefix || @product.slug ]
          sku_parts += options.values.map { |v| v.to_s.upcase.gsub(/\s+/, "-") }
          sku = sku_parts.join("-")

          # Calculate final price (base + adjustments)
          final_price_cents = @product.base_price_cents + price_adjustment

          # Also set legacy columns for backward compatibility
          legacy_attrs = {}
          legacy_attrs[:size] = options["Size"] if options["Size"].present?
          legacy_attrs[:color] = options["Color"] if options["Color"].present?
          legacy_attrs[:material] = options["Material"] if options["Material"].present?

          # Create the variant
          variant = @product.product_variants.create(
            options: options,
            variant_key: variant_key,
            variant_name: variant_name,
            sku: sku,
            price_cents: final_price_cents,
            stock_quantity: (params[:stock_quantity] || 0).to_i,
            available: true,
            weight_oz: @product.weight_oz,
            **legacy_attrs
          )

          if variant.persisted?
            { created: true, variant: variant }
          else
            { created: false, error: "Failed to create #{variant_name}: #{variant.errors.full_messages.join(', ')}" }
          end
        end

        # ==========================================
        # Legacy Generation (sizes/colors arrays)
        # ==========================================

        def generate_from_legacy_params
          sizes = params[:sizes] || []
          colors = params[:colors] || []

          if sizes.empty? && colors.empty?
            return render_error("At least one size or color must be provided")
          end

          variants_created = 0
          variants_skipped = 0
          errors = []

          if sizes.any? && colors.any?
            sizes.each do |size|
              colors.each do |color|
                result = create_variant_from_legacy(size, color)
                variants_created += 1 if result[:created]
                variants_skipped += 1 unless result[:created]
                errors << result[:error] if result[:error]
              end
            end
          elsif sizes.any?
            sizes.each do |size|
              result = create_variant_from_legacy(size, nil)
              variants_created += 1 if result[:created]
              variants_skipped += 1 unless result[:created]
              errors << result[:error] if result[:error]
            end
          else
            colors.each do |color|
              result = create_variant_from_legacy(nil, color)
              variants_created += 1 if result[:created]
              variants_skipped += 1 unless result[:created]
              errors << result[:error] if result[:error]
            end
          end

          message = "Generated #{variants_created} new variant#{'s' unless variants_created == 1}"
          message += " (#{variants_skipped} skipped - already exist)" if variants_skipped > 0

          render_success(
            {
              variants: @product.product_variants.reload.map { |v| serialize_variant(v) },
              created: variants_created,
              skipped: variants_skipped,
              errors: errors
            },
            message: message
          )
        end

        def create_variant_from_legacy(size, color)
          # Build options hash for new system
          options = {}
          options["Size"] = size if size.present?
          options["Color"] = color if color.present?

          # Check if exists by legacy columns OR options
          existing = @product.product_variants.find_by(size: size, color: color) ||
                     @product.product_variants.find_by(options: options)
          return { created: false, variant: existing } if existing

          # Generate variant details
          variant_key = [ size, color ].compact.map { |v| v.to_s.parameterize }.join("-")
          variant_name = [ size, color ].compact.join(" / ")
          sku_parts = [ @product.sku_prefix || @product.slug ]
          sku_parts += [ size, color ].compact.map { |v| v.to_s.upcase.gsub(/\s+/, "-") }
          sku = sku_parts.join("-")

          variant = @product.product_variants.create(
            size: size,
            color: color,
            options: options,
            variant_key: variant_key,
            variant_name: variant_name,
            sku: sku,
            price_cents: @product.base_price_cents,
            stock_quantity: (params[:stock_quantity] || 0).to_i,
            available: true,
            weight_oz: @product.weight_oz
          )

          if variant.persisted?
            { created: true, variant: variant }
          else
            { created: false, error: "Failed to create #{variant_name}: #{variant.errors.full_messages.join(', ')}" }
          end
        end

        def variant_params
          source = params[:product_variant].presence || params[:variant].presence
          raise ActionController::ParameterMissing, :product_variant unless source

          source.permit(
            :size,
            :color,
            :material,
            :variant_key,
            :variant_name,
            :sku,
            :price_cents,
            :stock_quantity,
            :low_stock_threshold,
            :available,
            :weight_oz,
            :shopify_variant_id,
            :barcode,
            options: {}  # Allow flexible options hash
          )
        end

        def serialize_variant(variant)
          {
            id: variant.id,
            product_id: variant.product_id,
            # Flexible options (new system)
            options: variant.options,
            option_types: variant.option_types,
            # Legacy columns (for backward compatibility)
            size: variant.size,
            color: variant.color,
            material: variant.material,
            # Display fields
            variant_key: variant.variant_key,
            variant_name: variant.variant_name,
            display_name: variant.display_name,
            sku: variant.sku,
            # Pricing
            price_cents: variant.price_cents,
            # Stock
            stock_quantity: variant.stock_quantity,
            low_stock_threshold: variant.low_stock_threshold,
            stock_status: variant.stock_status,
            low_stock: variant.low_stock?,
            available: variant.available,
            actually_available: variant.actually_available?,
            in_stock: variant.in_stock?,
            # Other
            weight_oz: variant.weight_oz,
            shopify_variant_id: variant.shopify_variant_id,
            barcode: variant.barcode,
            created_at: variant.created_at,
            updated_at: variant.updated_at
          }
        end
      end
    end
  end
end
