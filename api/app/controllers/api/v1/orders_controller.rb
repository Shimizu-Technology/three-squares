# frozen_string_literal: true

module Api
  module V1
    class OrdersController < ApplicationController
      before_action { Payments::Configuration.validate_database! }
      COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze

      rescue_from ActionController::ParameterMissing do |e|
        message = "Missing required parameter: #{e.param}. Wrap your request body in an '#{e.param}' key."
        render json: { success: false, error: message, message: message }, status: :bad_request
      end
      include Authenticatable
      skip_before_action :authenticate_request, only: [ :create, :show ] # Allow guest checkout and order viewing
      before_action :authenticate_optional, only: [ :create, :show ]
      before_action :require_admin!, only: [ :index, :update ]

      # GET /api/v1/orders/my
      # List orders for the current authenticated user
      def my_orders
        unless current_user
          return render json: { error: "Authentication required" }, status: :unauthorized
        end

        page = (params[:page] || 1).to_i
        per_page = (params[:per_page] || 10).to_i

        orders_query = current_user.orders.includes(:order_items).order(created_at: :desc)

        # Optional status filter
        if params[:status].present?
          orders_query = orders_query.where(status: params[:status])
        end

        total_count = orders_query.count
        orders = orders_query.offset((page - 1) * per_page).limit(per_page)

        render json: {
          orders: orders.map { |order| customer_order_json(order) },
          pagination: {
            current_page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end

      # GET /api/v1/orders
      # List all orders (admin only)
      def index
        # Pagination
        page = (params[:page] || 1).to_i
        per_page = (params[:per_page] || 25).to_i

        # Base query
        orders_query = staff_scope(Order.all).includes(order_items: { product_variant: { product: :collections } }, user: []).order(created_at: :desc)

        # Filters
        if params[:status].present?
          orders_query = orders_query.where(status: params[:status])
        end

        if params[:payment_status].present?
          orders_query = orders_query.where(payment_status: params[:payment_status])
        end

        if params[:order_type].present?
          orders_query = orders_query.where(order_type: params[:order_type])
        end

        if params[:fulfillment_type].present?
          orders_query = orders_query.where(fulfillment_type: params[:fulfillment_type])
        end

        if params[:location_id].present?
          orders_query = orders_query.where(location_id: params[:location_id].to_i)
        end

        if params[:business_line].present?
          orders_query = apply_business_line_filter(orders_query, params[:business_line].to_s)
        end

        # Search by order number, email, or name (case-insensitive for PostgreSQL)
        if params[:search].present?
          search_term = "%#{params[:search]}%"
          orders_query = orders_query.where(
            "order_number ILIKE ? OR customer_email ILIKE ? OR customer_name ILIKE ?",
            search_term, search_term, search_term
          )
        end

        # Date range filter
        start_at = parse_datetime_param(params[:start_date])
        end_at = parse_datetime_param(params[:end_date], end_of_day: true)

        orders_query = orders_query.where("orders.created_at >= ?", start_at) if start_at
        orders_query = orders_query.where("orders.created_at <= ?", end_at) if end_at

        # Paginate
        total_count = orders_query.count
        orders = orders_query.offset((page - 1) * per_page).limit(per_page)

        render json: {
          orders: orders.map { |order| order_json(order) },
          pagination: {
            current_page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end

      # POST /api/v1/orders
      # Compatibility completion: only an already-owned durable session can fund an order.
      def create
        session_id = params.dig(:order, :checkout_session_id)
        unless session_id.present?
          return render json: { error: "Start a checkout session before collecting payment. Existing legacy payments require reconciliation." }, status: :conflict
        end
        session = CheckoutSession.find(session_id)
        unless session.authorized?(user: current_user, capability: request.headers["X-Checkout-Capability"])
          return render json: { error: "Checkout session not found" }, status: :not_found
        end
        attempt = session.payment_attempts.order(:created_at).last
        supplied_reference = params.dig(:order, :payment_intent_id)
        if supplied_reference.present? && supplied_reference != attempt.raw_provider_id
          return render json: { error: "Payment reference does not match this checkout" }, status: :conflict
        end
        Payments::ReconcileAttempt.call(attempt: attempt)
        order = session.order.reload
        render json: { success: order.payment_status == "paid", order: order_json(order) }, status: order.payment_status == "paid" ? :created : :accepted
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Checkout session not found" }, status: :not_found
      rescue Payments::Configuration::UnsafeConfiguration, Stripe::StripeError
        render json: { error: "Payment is unavailable. Your order remains saved; check its status before paying again." }, status: :service_unavailable
      rescue Payments::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      # GET /api/v1/orders/:id
      # Get order details
      def show
        order = find_order_by_id_or_number(params[:id])
        return unless authorize_order_access(order)

        render json: {
          order: detailed_order_json(order)
        }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Order not found" }, status: :not_found
      end

      # PATCH /api/v1/orders/:id
      # Update order (admin only - for status changes, notes, etc.)
      def update
        order = staff_scope(Order.all).find(params[:id])

        if order.update(order_update_params)
          render json: {
            success: true,
            order: detailed_order_json(order),
            message: "Order updated successfully"
          }
        else
          render json: {
            success: false,
            errors: order.errors.full_messages
          }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Order not found" }, status: :not_found
      end

      private



      def parse_datetime_param(value, end_of_day: false)
        return nil if value.blank?

        if value.match?(/^\d{4}-\d{2}-\d{2}$/)
          date = Date.parse(value) rescue nil
          return nil unless date
          return end_of_day ? date.end_of_day : date.beginning_of_day
        end

        Time.zone.parse(value) rescue nil
      end

      def order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          payment_environment: order.payment_environment,
          simulated: order.simulated,
          inventory_committed: order.inventory_committed_at.present?,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          location: order.location ? { id: order.location.id, name: order.location.name, slug: order.location.slug } : nil,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          shipping_method: order.shipping_method,
          created_at: order.created_at.iso8601,
          item_count: order.order_items.count,
          notes: order.notes,
          order_items: order.order_items.map do |item|
            item_json = {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
            item_json[:special_instructions] = item.special_instructions if item.special_instructions.present?
            item_json
          end
        }

        # Add shipping info for retail orders
        if order.order_type == "retail"
          json.merge!(
            shipping_address_line1: order.shipping_address_line1,
            shipping_address_line2: order.shipping_address_line2,
            shipping_city: order.shipping_city,
            shipping_state: order.shipping_state,
            shipping_zip: order.shipping_zip,
            shipping_country: order.shipping_country
          )
        end

        json
      end

      def detailed_order_json(order)
        json = {
          payment_receipt: Payments::ReceiptFacts.for_order(order),
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          status_display: order.status&.titleize,
          payment_status: order.payment_status,
          payment_environment: order.payment_environment,
          simulated: order.simulated,
          inventory_committed: order.inventory_committed_at.present?,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          location: order.location ? { id: order.location.id, name: order.location.name, slug: order.location.slug } : nil,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          total_formatted: "$#{'%.2f' % ((order.total_cents || 0) / 100.0)}",
          created_at: order.created_at.iso8601,
          shipping_method: order.shipping_method,
          notes: order.notes,
          order_items: order.order_items.map do |item|
            item_json = {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
            item_json[:special_instructions] = item.special_instructions if item.special_instructions.present?
            item_json
          end
        }

        # Add shipping info for retail orders
        if order.order_type == "retail"
          json.merge!(
            shipping_address_line1: order.shipping_address_line1,
            shipping_address_line2: order.shipping_address_line2,
            shipping_city: order.shipping_city,
            shipping_state: order.shipping_state,
            shipping_zip: order.shipping_zip,
            shipping_country: order.shipping_country,
            tracking_number: order.tracking_number,
            tracking_url: tracking_url_for(order),
            can_track: order.tracking_number.present?
          )
        end

        json
      end


      def order_update_params
        # Non-admin endpoint: customers can only update their own notes.
        # admin_notes is admin-only — permit :notes (customer field) only.
        # Status changes MUST go through admin/orders_controller#update
        # to ensure notifications are dispatched.
        params.require(:order).permit(:notes)
      end

      # Generate tracking URL based on carrier
      def tracking_url_for(order)
        return nil unless order.tracking_number.present?

        tracking = order.tracking_number
        carrier = order.shipping_method&.downcase || ""

        if carrier.include?("usps")
          "https://tools.usps.com/go/TrackConfirmAction?tLabels=#{tracking}"
        elsif carrier.include?("ups")
          "https://www.ups.com/track?tracknum=#{tracking}"
        elsif carrier.include?("fedex")
          "https://www.fedex.com/fedextrack/?trknbr=#{tracking}"
        elsif carrier.include?("dhl")
          "https://www.dhl.com/en/express/tracking.html?AWB=#{tracking}"
        else
          # Generic - try USPS as default for Guam
          "https://tools.usps.com/go/TrackConfirmAction?tLabels=#{tracking}"
        end
      end

      # Support lookup by both numeric ID and order number (e.g., HAF-R-20251210-0001)
      def find_order_by_id_or_number(id_or_number)
        if id_or_number.to_s.match?(/\A\d+\z/)
          Order.includes(order_items: { product_variant: :product }).find(id_or_number)
        else
          Order.includes(order_items: { product_variant: :product }).find_by!(order_number: id_or_number)
        end
      end

      def authorize_order_access(order)
        # Admins can view any order
        if staff_access_policy.allowed?("orders.read") && staff_scope(Order.all).exists?(id: order.id)
          return true
        end

        return true if current_user && order.user_id == current_user.id
        if order.user_id.nil? && order.guest_access_digest.present? && order.guest_access_expires_at&.future?
          capability = request.headers["X-Order-Capability"].to_s
          return true if capability.present? && ActiveSupport::SecurityUtils.secure_compare(order.guest_access_digest, CheckoutSession.digest(capability))
        end

        render json: { error: "Order not found" }, status: :not_found
        false
      end

      # Simplified order JSON for customer-facing order history
      def customer_order_json(order)
        {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          status_display: order.status&.titleize,
          order_type: order.order_type,
          business_line: infer_business_line(order),
          fulfillment_type: order.fulfillment_type,
          order_type_display: order.order_type.titleize,
          total_cents: order.total_cents,
          total_formatted: "$#{'%.2f' % ((order.total_cents || 0) / 100.0)}",
          item_count: order.order_items.sum(:quantity),
          created_at: order.created_at.iso8601,
          created_at_display: order.created_at.strftime("%B %d, %Y"),
          # Tracking info (for shipped orders)
          tracking_number: order.tracking_number,
          shipping_method: order.shipping_method,
          # Status flags for UI
          can_track: order.tracking_number.present?,
          is_delivered: order.status == "delivered",
          is_cancelled: order.status == "cancelled",
          # Preview of items
          items_preview: order.order_items.first(3).map do |item|
            {
              product_name: item.product_name,
              variant_name: item.variant_name,
              quantity: item.quantity
            }
          end
        }
      end



      def apply_business_line_filter(relation, business_line)
        case business_line
        when "catering"
          relation.where(order_type: "wholesale")
        when "latte_stone"
          # Filter order IDs rather than joining the outer relation: multiple cookie
          # lines must not duplicate orders or make revenue SUM(DISTINCT amount).
          cookie_order_ids = Order
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .select(:id)
          relation.where(order_type: "retail", id: cookie_order_ids)
        when "three_squares"
          latte_stone_order_ids = Order
            .where(order_type: "retail")
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .select(:id)

          relation.where(order_type: "retail").where.not(id: latte_stone_order_ids)
        else
          relation
        end
      end

      def infer_business_line(order)
        return "catering" if order.order_type == "wholesale"
        return "three_squares" unless order.order_type == "retail"

        is_latte = order.order_items.any? do |item|
          item.product&.collections&.any? { |collection| COOKIE_COLLECTION_SLUGS.include?(collection.slug) }
        end

        is_latte ? "latte_stone" : "three_squares"
      end
    end
  end
end
