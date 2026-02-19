module Api
  module V1
    module Admin
      class InventoryAuditsController < BaseController
        before_action :require_manager_or_above!
        # GET /api/v1/admin/inventory_audits
        # List all inventory audits with filters
        def index
          audits = InventoryAudit.includes(:product_variant, :product, :order, :user)
                                 .recent

          # Apply filters
          audits = audits.for_product(params[:product_id]) if params[:product_id].present?
          audits = audits.for_variant(params[:variant_id]) if params[:variant_id].present?
          audits = audits.for_order(params[:order_id]) if params[:order_id].present?
          audits = audits.by_type(params[:audit_type]) if params[:audit_type].present?
          audits = audits.by_user(params[:user_id]) if params[:user_id].present?

          # Date range filter
          if params[:start_date].present? && params[:end_date].present?
            start_date = Date.parse(params[:start_date]).beginning_of_day
            end_date = Date.parse(params[:end_date]).end_of_day
            audits = audits.in_date_range(start_date, end_date)
          end

          # Pagination
          page = (params[:page] || 1).to_i
          per_page = [ (params[:per_page] || 50).to_i, 100 ].min
          total = audits.count
          audits = audits.offset((page - 1) * per_page).limit(per_page)

          render json: {
            audits: audits.map { |a| serialize_audit(a) },
            pagination: {
              current_page: page,
              per_page: per_page,
              total_count: total,
              total_pages: (total.to_f / per_page).ceil
            }
          }
        end

        # GET /api/v1/admin/inventory_audits/:id
        def show
          audit = InventoryAudit.includes(:product_variant, :product, :order, :user).find(params[:id])
          render json: { audit: serialize_audit(audit, full: true) }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Audit record not found" }, status: :not_found
        end

        # GET /api/v1/admin/products/:product_id/inventory_audits
        def for_product
          product = Product.find(params[:product_id])

          # Get audits for the product itself or any of its variants
          variant_ids = product.product_variants.pluck(:id)
          audits = InventoryAudit.includes(:product_variant, :order, :user)
                                 .where("product_id = ? OR product_variant_id IN (?)", product.id, variant_ids)
                                 .recent
                                 .limit(100)

          render json: {
            product: {
              id: product.id,
              name: product.name,
              inventory_level: product.inventory_level
            },
            audits: audits.map { |a| serialize_audit(a) }
          }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Product not found" }, status: :not_found
        end

        # GET /api/v1/admin/product_variants/:variant_id/inventory_audits
        def for_variant
          variant = ProductVariant.includes(:product).find(params[:variant_id])
          audits = InventoryAudit.includes(:order, :user)
                                 .for_variant(variant.id)
                                 .recent
                                 .limit(100)

          render json: {
            variant: {
              id: variant.id,
              sku: variant.sku,
              display_name: variant.display_name,
              current_stock: variant.stock_quantity,
              product_name: variant.product.name
            },
            audits: audits.map { |a| serialize_audit(a) }
          }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Variant not found" }, status: :not_found
        end

        # GET /api/v1/admin/orders/:order_id/inventory_audits
        def for_order
          order = Order.find(params[:order_id])
          audits = InventoryAudit.includes(:product_variant, :product, :user)
                                 .for_order(order.id)
                                 .recent

          render json: {
            order: {
              id: order.id,
              order_number: order.order_number,
              status: order.status
            },
            audits: audits.map { |a| serialize_audit(a) }
          }
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Order not found" }, status: :not_found
        end

        # GET /api/v1/admin/inventory_audits/summary
        # Get summary statistics for inventory changes
        def summary
          start_date = params[:start_date].present? ? Date.parse(params[:start_date]) : 30.days.ago
          end_date = params[:end_date].present? ? Date.parse(params[:end_date]) : Time.current

          audits = InventoryAudit.in_date_range(start_date, end_date)

          render json: {
            period: {
              start_date: start_date.to_date,
              end_date: end_date.to_date
            },
            summary: {
              total_audits: audits.count,
              by_type: audits.group(:audit_type).count,
              total_stock_added: audits.stock_increases.sum(:quantity_change),
              total_stock_removed: audits.stock_decreases.sum(:quantity_change).abs,
              orders_affecting_stock: audits.where.not(order_id: nil).distinct.count(:order_id)
            }
          }
        end

        private

        def serialize_audit(audit, full: false)
          data = {
            id: audit.id,
            audit_type: audit.audit_type,
            quantity_change: audit.quantity_change,
            formatted_change: audit.formatted_change,
            previous_quantity: audit.previous_quantity,
            new_quantity: audit.new_quantity,
            reason: audit.reason,
            created_at: audit.created_at,
            display_name: audit.display_name,
            user: audit.user_display
          }

          if audit.product_variant.present?
            data[:variant] = {
              id: audit.product_variant.id,
              sku: audit.product_variant.sku,
              display_name: audit.product_variant.display_name
            }
          end

          if audit.product.present?
            data[:product] = {
              id: audit.product.id,
              name: audit.product.name
            }
          end

          if audit.order.present?
            data[:order] = {
              id: audit.order.id,
              order_number: audit.order.order_number
            }
          end

          if full
            data[:metadata] = audit.metadata
          end

          data
        end
      end
    end
  end
end
