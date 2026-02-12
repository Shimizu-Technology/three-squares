module Api
  module V1
    class ProductsController < ApplicationController
      COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
      before_action :set_product, only: [ :show ]

      # GET /api/v1/products
      def index
        @products = Product.published.active  # Only show active (non-archived) products
                          .includes(:product_variants, :product_images, :collections, :product_locations)

        # Base ordering (will be overridden by sort param if present)
        @products = @products.order(featured: :desc, created_at: :desc) unless params[:sort].present?

        # Filters
        @products = @products.where(product_type: params[:product_type]) if params[:product_type].present?

        if params[:business_line].present?
          @products = apply_business_line_filter(@products, params[:business_line].to_s)
        end

        # Collection filter - support both ID and slug
        if params[:collection].present?
          @products = @products.joins(:collections).where(collections: { slug: params[:collection] })
        elsif params[:collection_id].present?
          @products = @products.joins(:collections).where(collections: { id: params[:collection_id] })
        end

        @products = @products.where(featured: true) if params[:featured] == "true"

        if params[:location_id].present?
          location_id = params[:location_id].to_i
          @products = @products
            .joins(:product_locations)
            .where(product_locations: { location_id: location_id, available: true })
            .distinct
        end

        # Search
        if params[:search].present?
          @products = @products.where("products.name ILIKE ? OR products.description ILIKE ?", "%#{params[:search]}%", "%#{params[:search]}%")
        end

        # Price range
        if params[:min_price].present? || params[:max_price].present?
          min = params[:min_price].to_i * 100 if params[:min_price].present?
          max = params[:max_price].to_i * 100 if params[:max_price].present?

          @products = @products.where("base_price_cents >= ?", min) if min
          @products = @products.where("base_price_cents <= ?", max) if max
        end

        # Sorting
        if params[:sort].present?
          case params[:sort]
          when "price_asc"
            @products = @products.order(base_price_cents: :asc)
          when "price_desc"
            @products = @products.order(base_price_cents: :desc)
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
        total_count = @products.count

        @products = @products.page(page).per(per_page) rescue @products.limit(per_page).offset((page - 1) * per_page)

        render json: {
          products: @products.map { |p| serialize_product(p) },
          meta: {
            page: page,
            per_page: per_page,
            total: total_count
          }
        }
      end

      # GET /api/v1/products/:id
      def show
        render json: serialize_product_full(@product)
      end

      private

      def set_product
        @product = Product.published
                         .includes(:product_variants, :product_images, :collections, :product_locations)
                         .find_by(id: params[:id]) ||
                   Product.published
                         .includes(:product_variants, :product_images, :collections, :product_locations)
                         .find_by(slug: params[:id])

        render json: { error: "Product not found" }, status: :not_found unless @product
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
          published: product.published,
          featured: product.featured,
          product_type: product.product_type,
          allow_pickup: product.allow_pickup,
          allow_shipping: product.allow_shipping,
          available_location_ids: product.product_locations.available.pluck(:location_id),
          in_stock: product.in_stock?,
          actually_available: product.actually_available?,
          primary_image_url: product.primary_image&.signed_url,
          collections: product.collections.map { |c| { id: c.id, name: c.name, slug: c.slug } },
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
          actually_available: product.actually_available?,
          collections: product.collections.map { |c|
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
          available: variant.available,
          actually_available: variant.actually_available?,
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
