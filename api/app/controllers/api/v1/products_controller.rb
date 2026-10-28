module Api
  module V1
    class ProductsController < ApplicationController
      COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
      before_action :set_menu_time
      before_action :set_product, only: [ :show ]

      # GET /api/v1/products
      def index
        @products = public_products_scope

        # Base ordering (will be overridden by sort param if present)
        @products = @products.order(featured: :desc, created_at: :desc) unless params[:sort].present?

        # Filters

        if params[:business_line].present?
          @products = apply_business_line_filter(@products, params[:business_line].to_s)
        end

        # Collection filter - support both ID and slug
        if params[:collection].present?
          @products = @products.joins(:collections).merge(Collection.ordering_at(@menu_time).for_enabled_storefronts)
            .where(collections: { slug: params[:collection] })
        elsif params[:collection_id].present?
          @products = @products.joins(:collections).merge(Collection.ordering_at(@menu_time).for_enabled_storefronts)
            .where(collections: { id: params[:collection_id] })
        end

        @products = @products.where(featured: true) if params[:featured] == "true"

        if params[:location_id].present?
          location_id = params[:location_id].to_i
          @products = @products.offered_at(location_id)
        end

        # Search
        if params[:search].present?
          @products = @products.where("products.name ILIKE ? OR products.description ILIKE ?", "%#{params[:search]}%", "%#{params[:search]}%")
        end

        price_sql = CatalogPrice.sql(location_id: params[:location_id], online: true, settings: @storefront_settings)

        # Price range
        if params[:min_price].present? || params[:max_price].present?
          min = (BigDecimal(params[:min_price].to_s, exception: false).to_d * 100).round.to_i if params[:min_price].present?
          max = (BigDecimal(params[:max_price].to_s, exception: false).to_d * 100).round.to_i if params[:max_price].present?

          @products = @products.where(Arel.sql(price_sql).gteq(min)) if min
          @products = @products.where(Arel.sql(price_sql).lteq(max)) if max
        end

        # Type choices describe the complete eligible result set, independent of
        # the selected type and current page.
        product_types = @products.except(:includes, :order).distinct.pluck(:product_type)
          .compact.reject { |type| type.blank? || type == "market_price" }.sort
        @products = @products.where(product_type: params[:product_type]) if params[:product_type].present?

        # Sorting
        if params[:sort].present?
          case params[:sort]
          when "price_asc"
            @products = @products.select("products.*, (#{price_sql}) AS catalog_price_cents").order(Arel.sql("catalog_price_cents ASC NULLS LAST, products.id ASC"))
          when "price_desc"
            @products = @products.select("products.*, (#{price_sql}) AS catalog_price_cents").order(Arel.sql("catalog_price_cents DESC NULLS LAST, products.id ASC"))
          when "newest"
            @products = @products.order(created_at: :desc)
          when "name_asc"
            @products = @products.order(name: :asc)
          when "name_desc"
            @products = @products.order(name: :desc)
          else
            # Default: featured first, then newest
            @products = @products.order(featured: :desc, created_at: :desc)
          end
        end

        # Pagination
        page = params[:page]&.to_i || 1
        per_page = [ params[:per_page]&.to_i || 12, 50 ].min # Max 50 per page

        # Get total count BEFORE pagination
        total_count = @products.except(:select, :order).count

        @products = @products.page(page).per(per_page) rescue @products.limit(per_page).offset((page - 1) * per_page)

        render json: {
          products: @products.map { |p| serialize_product(p) },
          meta: {
            page: page,
            per_page: per_page,
            total: total_count,
            product_types: product_types
          }
        }
      end

      # GET /api/v1/products/:id
      def show
        if params[:location_id].present? && @product.allow_pickup? && !@product.offered_for_location?(params[:location_id])
          return render json: { error: "Product not found" }, status: :not_found
        end
        render json: serialize_product_full(@product)
      end

      private

      def set_menu_time
        @storefront_settings = SiteSetting.instance
        @menu_time = Time.current
      end

      def visible_collections(product)
        product.collections.visible_at(@menu_time).for_enabled_storefronts
      end

      def set_product
        @product = public_products_scope.find_by(id: params[:id]) ||
                   public_products_scope.find_by(slug: params[:id])

        render json: { error: "Product not found" }, status: :not_found unless @product
      end

      def public_products_scope
        MenuEligibility.scope(StorefrontEligibility.scope(Product.published.active), at: @menu_time)
          .preload(:product_variants, :product_images, :collections, :product_locations)
      end

      def serialize_product(product)
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description&.truncate(200),
          pricing: CatalogPrice.resolve(product: product, location_id: params[:location_id], online: true, settings: @storefront_settings).as_json,
          base_price_cents: product.base_price_cents,
          sale_price_cents: product.sale_price_cents,
          new_product: product.new_product,
          published: product.published,
          featured: product.featured,
          product_type: product.product_type,
          allow_pickup: product.allow_pickup,
          allow_shipping: product.allow_shipping,
          available_location_ids: product.product_locations.available.pluck(:location_id),
          in_stock: product.in_stock?,
          actually_available: product.actually_available? && (params[:location_id].blank? || !product.allow_pickup? || product.available_for_location?(params[:location_id])),
          primary_image_url: product.primary_image&.signed_url,
          collections: visible_collections(product).map { |c| { id: c.id, name: c.name, slug: c.slug } },
          variant_count: product.product_variants.available.count,
          total_stock: product.product_variants.sum(:stock_quantity),
          created_at: product.created_at
        }
      end

      def serialize_product_full(product)
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          pricing: CatalogPrice.resolve(product: product, location_id: params[:location_id], online: true, settings: @storefront_settings).as_json,
          base_price_cents: product.base_price_cents,
          sale_price_cents: product.sale_price_cents,
          new_product: product.new_product,
          published: product.published,
          featured: product.featured,
          product_type: product.product_type,
          vendor: product.vendor,
          weight_oz: product.weight_oz,
          inventory_level: product.inventory_level,
          allow_pickup: product.allow_pickup,
          allow_shipping: product.allow_shipping,
          available_location_ids: product.product_locations.available.pluck(:location_id),
          product_stock_quantity: product.product_stock_quantity,
          product_low_stock_threshold: product.product_low_stock_threshold,
          in_stock: product.in_stock?,
          actually_available: product.actually_available? && (params[:location_id].blank? || !product.allow_pickup? || product.available_for_location?(params[:location_id])),
          collections: visible_collections(product).map { |c|
            {
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description
            }
          },
          variants: product.product_variants.map { |v| serialize_variant(v) },
          images: product.product_images.primary_first.map { |i| serialize_image(i) },
          meta_title: product.meta_title,
          meta_description: product.meta_description,
          created_at: product.created_at,
          updated_at: product.updated_at
        }
      end

      def serialize_variant(variant)
        {
          id: variant.id,
          options: variant.options,
          size: variant.size,
          color: variant.color,
          material: variant.material,
          display_name: variant.display_name,
          sku: variant.sku,
          price_cents: variant.price_cents,
          pricing: CatalogPrice.resolve(product: variant.product, variant: variant, location_id: params[:location_id], online: true, settings: @storefront_settings).as_json,
          available: variant.available,
          actually_available: variant.actually_available? && (params[:location_id].blank? || !variant.product.allow_pickup? || variant.product.available_for_location?(params[:location_id])),
          in_stock: variant.in_stock?,
          stock_quantity: variant.stock_quantity,
          weight_oz: variant.weight_oz
        }
      end

      def serialize_image(image)
        {
          id: image.id,
          url: image.signed_url,
          alt_text: image.alt_text,
          position: image.position,
          primary: image.primary
        }
      end

      def apply_business_line_filter(relation, business_line)
        case business_line
        when "latte_stone"
          relation.joins(:collections).where(collections: { slug: COOKIE_COLLECTION_SLUGS }).distinct
        when "catering"
          relation.joins(:collections).where("collections.slug LIKE ?", "catering-%").distinct
        when "three_squares"
          excluded_ids = Product
            .joins(:collections)
            .where("collections.slug IN (?) OR collections.slug LIKE ?", COOKIE_COLLECTION_SLUGS, "catering-%")
            .select(:id)

          relation.where.not(id: excluded_ids)
        else
          relation
        end
      end
    end
  end
end
