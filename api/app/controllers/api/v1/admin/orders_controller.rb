# frozen_string_literal: true
require "csv"

module Api
  module V1
    module Admin
    class OrdersController < ApplicationController
      COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
      include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!
        before_action :set_order, only: [ :show, :update, :notify, :refund, :reconcile_refund ]

      # GET /api/v1/admin/orders
      # List all orders (admin only)
      # Uses filtered_orders_query to ensure consistent filtering across index/export/summary
      def index
        # Pagination
        page = (params[:page] || 1).to_i
        per_page = (params[:per_page] || 25).to_i

        # Use shared filtered query for consistent filtering across all order endpoints
        orders_query = filtered_orders_query

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

      # GET /api/v1/admin/orders/export
      # Export filtered orders as CSV for operations/reporting workflows
      def export
        orders = filtered_orders_query
        csv_data = build_orders_csv(orders)

        send_data csv_data,
                  filename: "orders-export-#{Time.current.strftime('%Y%m%d-%H%M%S')}.csv",
                  type: "text/csv"
      end

      # GET /api/v1/admin/orders/summary
      # Lightweight counts for queue dashboards and operational triage.
      def summary
        orders = filtered_orders_query(ignore_stage: true).except(:includes, :order)

        status_counts = orders.group(:status).count
        total_orders = orders.count
        paid_orders = orders.where(payment_status: "paid").count
        summary = {
          total_orders: total_orders,
          paid_orders: paid_orders,
          status_counts: status_counts,
          queue_stage_counts: pickup_stage_counts(orders)
        }
        if staff_access_policy.allowed?("analytics.read")
          summary[:total_revenue_cents] = Payments::Revenue.total(orders)
        end
        render json: summary
      end

      # GET /api/v1/admin/orders/:id
      # Get single order details
      def show
        render json: { order: detailed_order_json(@order) }
      end

      # PATCH/PUT /api/v1/admin/orders/:id
      # Update order (status, tracking, notes)
      def update
        if !staff_access_policy.allowed?("orders.manage") && (params.require(:order).keys - [ "status" ]).any?
          return render json: { error: "Your role can change order status only" }, status: :forbidden
        end
        @order = Payments::UpdateOrder.call(order: @order, attributes: order_update_params, user: current_user)
        render json: { order: detailed_order_json(@order), message: @order.metadata.dig('inventory_restoration', 'status') == 'manual_review_required' ?
          "Order updated. Inventory restoration requires manual review; no stock was changed." : "Order updated successfully" }
      rescue Payments::Error, ActiveRecord::RecordInvalid => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      # POST /api/v1/admin/orders/:id/notify
      # Resend notification to customer (email + SMS) for current status
      def notify
        # Terminal statuses — re-notifying would confuse customers
        blocked = %w[cancelled delivered picked_up]
        if @order.status.in?(blocked)
          render json: { error: "Cannot resend notification for '#{@order.status}' orders" }, status: :unprocessable_entity
          return
        end

        # Pending orders: resend confirmation (email + SMS) instead of status notifications
        if @order.status == "pending"
          email_sent = false
          sms_sent = false
          settings = SiteSetting.instance

          begin
            if settings.enable_order_emails && @order.customer_email.present?
              @order.update_column(:confirmation_email_sent, false)
              SendOrderConfirmationEmailJob.perform_later(@order.id)
              email_sent = true
            end
            if settings.enable_order_sms && @order.customer_phone.present?
              @order.update_column(:confirmation_sms_sent, false)
              SendOrderConfirmationSmsJob.perform_later(@order.id)
              sms_sent = true
            end
          rescue StandardError => e
            # Redis/job queue down — reset flags so the admin can retry.
            # Return 503 instead of a raw 500 so the frontend can show
            # "service temporarily unavailable" instead of a generic error.
            Rails.logger.error "❌ Notify resend failed for Order ##{@order.id}: #{e.message}"
            render json: { error: "Notification service temporarily unavailable — please try again" }, status: :service_unavailable
            return
          end

          if email_sent || sms_sent
            channels = []
            channels << "email" if email_sent
            channels << "SMS" if sms_sent
            render json: { message: "Confirmation resent (#{channels.join(' + ')})" }
          else
            render json: { error: "No channels available for confirmation resend" }, status: :unprocessable_entity
          end
          return
        end

        # Non-pending: force resend status notifications.
        # Rescue enqueue failures — match update action's error handling.
        begin
          sent = send_status_notifications(@order, force: true)
        rescue StandardError => e
          Rails.logger.error "❌ Failed to enqueue resend for order ##{@order.order_number}: #{e.message}"
          render json: { error: "Notification enqueue failed — please try again", details: e.message }, status: :service_unavailable
          return
        end

        if sent[:any]
          channels = []
          channels << "email" if sent[:email]
          channels << "SMS" if sent[:sms]
          render json: { message: "Notification resent for status '#{@order.status}' (#{channels.join(' + ')})" }
        else
          warnings = sent[:warnings] || []
          render json: {
            error: "No notifications sent for status '#{@order.status}'",
            reasons: warnings
          }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/admin/orders/:id/refund
      # Process a refund for an order
      def refund
        request_key = request.headers["Idempotency-Key"]
        if request_key.blank?
          return render json: { error: "Idempotency-Key header is required" }, status: :bad_request
        end
        raw_amount = params[:amount_cents]
        unless raw_amount.is_a?(Integer) || (raw_amount.is_a?(String) && raw_amount.match?(/\A[1-9]\d*\z/))
          return render json: { error: "amount_cents must be a positive integer" }, status: :unprocessable_entity
        end
        restoration_request = { restock_items: params[:restock_items] }.compact
        metadata = params.permit(metadata: {})[:metadata]&.to_h || {}
        result = PaymentService.refund_payment(order: @order, amount_cents: raw_amount.to_i,
          reason: params[:reason], admin_user: current_user, request_key: request_key,
          metadata: metadata, restoration_request: restoration_request)
        render_refund_result(result, restoration_request)
      end

      def reconcile_refund
        operation = RefundOperation.find_by!(id: params[:operation_id], order: @order)
        service = Payments::RefundPayment.new
        result = if operation.state == 'reserved'
          service.call(order: @order, amount_cents: operation.amount_cents, request_key: operation.caller_idempotency_key,
            reason: operation.reason, admin_user: operation.user, metadata: operation.metadata, restoration_request: operation.restoration_request)
        else
          service.reconcile(operation: operation)
        end
        render_refund_result(result, operation.restoration_request)
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Refund operation not found' }, status: :not_found
      end


      private

      def render_refund_result(result, restoration_request)
        refund = result[:refund]
        operation = refund&.refund_operation
        restoration = refund&.reload&.metadata&.dig('inventory_restoration') || {}
        requested = operation.present? && operation.restoration_request['restock_items'].present? && operation.restoration_request['restock_items'] != false
        restoration_status = restoration['status'] || (requested ? 'pending' : 'not_requested')
        restoration_required = restoration_status == 'manual_review_required'
        message = if result[:success]
          restoration_required ? 'Refund confirmed. Inventory restoration requires manual review; no stock was restored.' : 'Refund confirmed'
        elsif result[:no_operation]
          'Refund request rejected before dispatch. Review and correct it.'
        elsif result[:status] == 'failed'
          'Refund failed. Its reservation has been released.'
        else
          "Refund #{result[:status]}; its amount remains reserved until resolved"
        end
        render json: {
          message: message,
          success: result[:success], no_operation: result[:no_operation] == true,
          error: result[:error], status: result[:status],
          refund: refund && refund_json(refund), operation_uuid: operation&.id,
          inventory_restored: restoration['restored'] == true,
          restoration_requested: operation&.restoration_request || restoration_request,
          inventory_restoration_required: restoration_required,
          restoration_status: restoration_status, inventory_restoration_status: restoration_status,
          order: detailed_order_json(@order.reload)
        }, status: result[:http_status]
      end


      # Send email + SMS notifications for the current order status.
      # Both channels are gated here before enqueueing:
      #   - Email: checked against enable_order_emails + customer_email presence
      #   - SMS: checked against enable_order_sms + customer_phone presence
      # This avoids enqueueing jobs that will immediately no-op.
      # Returns a hash describing what was actually enqueued:
      #   { any: true/false, email: true/false, sms: true/false, warnings: [...] }
      # @param order [Order]
      # @param force [Boolean] when true, reset seq counters first (for admin resend)
      def send_status_notifications(order, force: false)
        settings = SiteSetting.instance
        emails_on = settings.enable_order_emails
        sms_on = settings.enable_order_sms

        has_email = order.customer_email.present?
        has_phone = order.customer_phone.present?

        warnings = []
        event = order.status

        # Validate status has a notification template BEFORE calling
        # notification_seq — avoids ArgumentError for unknown statuses.
        unless Order::STATUS_SEQUENCE.key?(event) && event != "pending"
          warnings << "No notification template for status '#{event}'"
          return { any: false, email: false, sms: false, warnings: warnings }
        end

        seq = order.notification_seq

        # Shipped requires tracking number
        if event == "shipped" && order.tracking_number.blank?
          warnings << "No tracking number — shipped notifications require tracking info"
          return { any: false, email: false, sms: false, warnings: warnings }
        end

        will_email = emails_on && has_email
        will_sms = sms_on && has_phone

        email_sent = false
        sms_sent = false

        # Snapshot original seq values BEFORE decrementing, so we can
        # restore the exact original on enqueue failure (not just `seq`).
        original_email_seq = order.last_email_seq
        original_sms_seq = order.last_sms_seq

        # Force-resend: reset seq to seq-1 so the job's `last_*_seq < seq`
        # guard passes. Uses >= to handle backward status changes too
        # (e.g. shipped→confirmed: last_email_seq=5, seq=2 → set to 1).
        if force
          if will_email
            Order.where(id: order.id).where("last_email_seq >= ?", seq)
                 .update_all(last_email_seq: seq - 1)
          end
          if will_sms
            Order.where(id: order.id).where("last_sms_seq >= ?", seq)
                 .update_all(last_sms_seq: seq - 1)
          end
        end

        # Enqueue each channel independently so a partial failure (e.g.
        # email enqueues but SMS raises) only rolls back the failed channel.
        # A single rescue block would leave the successful channel's seq
        # decremented, causing duplicates on the next Notify click.
        if will_email
          begin
            SendOrderStatusEmailJob.perform_later(order.id, event, seq)
            email_sent = true
          rescue StandardError => e
            if force
              Order.where(id: order.id, last_email_seq: seq - 1)
                   .update_all(last_email_seq: original_email_seq)
            end
            Rails.logger.error "❌ Failed to enqueue email for order ##{order.order_number}: #{e.message}"
            warnings << "Email notification failed to enqueue"
          end
        end

        if will_sms
          begin
            SendOrderSmsJob.perform_later(order.id, event, seq)
            sms_sent = true
          rescue StandardError => e
            if force
              Order.where(id: order.id, last_sms_seq: seq - 1)
                   .update_all(last_sms_seq: original_sms_seq)
            end
            Rails.logger.error "❌ Failed to enqueue SMS for order ##{order.order_number}: #{e.message}"
            warnings << "SMS notification failed to enqueue"
          end
        end

        warnings << "Email enabled but customer has no email address" if emails_on && !has_email
        warnings << "SMS enabled but customer has no phone number" if sms_on && !has_phone

        { any: email_sent || sms_sent, email: email_sent, sms: sms_sent, warnings: warnings }
      end

      def filtered_orders_query(ignore_stage: false)
        orders_query = staff_scope(Order.all)
          .includes(order_items: [{ product: :collections }, { product_variant: { product: :collections } }], user: [], location: [])
          .order(created_at: :desc)

        orders_query = orders_query.where(status: params[:status]) if params[:status].present? && !ignore_stage
        orders_query = apply_pickup_stage(orders_query, params[:queue_stage]) unless ignore_stage
        orders_query = orders_query.where(payment_status: params[:payment_status]) if params[:payment_status].present?
        orders_query = orders_query.where(order_type: params[:order_type]) if params[:order_type].present?
        orders_query = orders_query.where(fulfillment_type: params[:fulfillment_type]) if params[:fulfillment_type].present?
        # Location scoping: staff assigned to a location only see that location's orders
        if params[:location_id].present?
          orders_query = orders_query.where(location_id: params[:location_id].to_i)
        end

        if params[:search].present?
          search_term = "%#{params[:search]}%"
          orders_query = orders_query.where(
            "order_number ILIKE ? OR customer_email ILIKE ? OR customer_name ILIKE ?",
            search_term, search_term, search_term
          )
        end

        start_at = parse_datetime_param(params[:start_date])
        end_at = parse_datetime_param(params[:end_date], end_of_day: true)
        orders_query = orders_query.where("orders.created_at >= ?", start_at) if start_at
        orders_query = orders_query.where("orders.created_at <= ?", end_at) if end_at

        if params[:business_line].present?
          orders_query = apply_business_line_filter(orders_query, params[:business_line].to_s)
        end

        orders_query
      end

      def apply_pickup_stage(relation, stage)
        return relation if stage.blank? || stage == "all"

        pickups = relation.where(fulfillment_type: "pickup")
        case stage
        when "new_paid" then pickups.where(status: "pending", payment_status: "paid")
        when "waiting_payment" then pickups.where(status: "pending").where.not(payment_status: "paid")
        when "confirmed" then pickups.where(status: %w[confirmed processing], payment_status: "paid")
        when "all_active" then pickups.where(status: %w[pending confirmed processing ready], payment_status: "paid")
        when "ready", "picked_up" then pickups.where(status: stage, payment_status: "paid")
        else pickups.none
        end
      end

      def pickup_stage_counts(relation)
        groups = relation.where(fulfillment_type: "pickup").group(:status, :payment_status).count
        paid = ->(statuses) { groups.sum { |(status, payment), count| payment == "paid" && statuses.include?(status) ? count : 0 } }
        {
          new_paid: paid.call(%w[pending]), confirmed: paid.call(%w[confirmed processing]),
          ready: paid.call(%w[ready]), picked_up: paid.call(%w[picked_up]),
          waiting_payment: groups.sum { |(status, payment), count| status == "pending" && payment != "paid" ? count : 0 },
          all_active: paid.call(%w[pending confirmed processing ready])
        }
      end

      def parse_datetime_param(value, end_of_day: false)
        return nil if value.blank?

        if value.match?(/^\d{4}-\d{2}-\d{2}$/)
          date = Date.parse(value) rescue nil
          return nil unless date
          return end_of_day ? date.end_of_day : date.beginning_of_day
        end

        Time.zone.parse(value) rescue nil
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

      def build_orders_csv(orders)
        orders = orders.where(simulated: false, payment_environment: "production")
        money = Payments::Revenue.by_order(orders)
        CSV.generate(headers: true) do |csv|
          csv << [
            "order_number",
            "created_at",
            "status",
            "payment_status",
            "order_type",
            "business_line",
            "fulfillment_type",
            "location",
            "customer_name",
            "customer_email",
            "item_count",
            "subtotal_cents",
            "shipping_cost_cents",
            "tax_cents",
            "total_cents",
            "total_usd",
            "captured_cents",
            "succeeded_refunds_cents",
            "net_revenue_cents"
          ]

          orders.each do |order|
            csv << [
              order.order_number,
              order.created_at.iso8601,
              order.status,
              order.payment_status,
              order.order_type,
              infer_business_line(order),
              order.fulfillment_type,
              order.location&.name,
              order.customer_name,
              order.customer_email,
              order.order_items.sum(&:quantity),
              order.subtotal_cents,
              order.shipping_cost_cents,
              order.tax_cents,
              order.total_cents,
              format("%.2f", (order.total_cents || 0) / 100.0),
              *money.fetch(order.id).values_at(:captured_cents, :succeeded_refunds_cents, :net_revenue_cents)
            ]
          end
        end
      end

      def set_order
        scope = staff_scope(Order.includes(:order_items, :user, :refunds))
        @order = scope.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Order not found" }, status: :not_found
      end

      def get_cart_items
        if current_user
          # First, merge any session cart items to the user
          merge_session_cart_to_user
          current_user.cart_items.includes(product_variant: { product: :product_images })
        else
          session_id = request.headers["X-Session-ID"] || cookies[:session_id]
          return [] if session_id.blank?
          CartItem.where(session_id: session_id).includes(product_variant: { product: :product_images })
        end
      end

      # Merge session-based cart items to the logged-in user
      def merge_session_cart_to_user
        session_id = request.headers["X-Session-ID"] || request.cookies["session_id"]
        return unless current_user && session_id.present?

        session_items = CartItem.where(session_id: session_id)
        return if session_items.empty?

        session_items.each do |session_item|
          existing_item = current_user.cart_items.find_by(product_variant_id: session_item.product_variant_id)

          if existing_item
            existing_item.update(quantity: existing_item.quantity + session_item.quantity)
            session_item.destroy
          else
            session_item.update(user_id: current_user.id, session_id: nil)
          end
        end
      end

      def validate_cart_items(cart_items)
        issues = []

        cart_items.each do |item|
          variant = item.product_variant
          product = variant.product

          # Check if product is published and variant is available
          if !(product.published? && variant.available)
            issues << { item_id: item.id, message: "#{product.name} is no longer available" }
          elsif !variant.in_stock?
            issues << { item_id: item.id, message: "#{product.name} - #{variant.display_name} is out of stock" }
          elsif item.quantity > variant.stock_quantity
            issues << { item_id: item.id, message: "Only #{variant.stock_quantity} of #{product.name} available" }
          end
        end

        issues
      end

      def build_order(cart_items)
        shipping_address = order_params[:shipping_address] || {}
        shipping_method_params = order_params[:shipping_method] || {}

        order = Order.new(
          user: current_user,
          order_type: "retail",
          status: "pending",
          email: order_params[:email] || order_params[:customer_email],
          phone: order_params[:phone] || order_params[:customer_phone],
          name: shipping_address[:name] || order_params[:customer_name],

          # Shipping address
          shipping_address_line1: shipping_address[:street1] || order_params[:shipping_address_line1],
          shipping_address_line2: shipping_address[:street2] || order_params[:shipping_address_line2],
          shipping_city: shipping_address[:city] || order_params[:shipping_city],
          shipping_state: shipping_address[:state] || order_params[:shipping_state],
          shipping_zip: shipping_address[:zip] || order_params[:shipping_zip],
          shipping_country: shipping_address[:country] || order_params[:shipping_country] || "US",

          # Shipping method (store as JSON/text with carrier and service info)
          shipping_method: [ shipping_method_params[:carrier], shipping_method_params[:service] ].compact.join(" ").presence,
          shipping_cost_cents: shipping_method_params[:rate_cents] || 0
        )

        # Calculate totals
        subtotal_cents = 0

        cart_items.each do |cart_item|
          item_price = cart_item.product_variant.price_cents
          item_total = item_price * cart_item.quantity

          order.order_items.build(
            product_variant: cart_item.product_variant,
            product_id: cart_item.product.id,
            quantity: cart_item.quantity,
            unit_price_cents: item_price,
            total_price_cents: item_total,
            product_name: cart_item.product.name,
            product_sku: cart_item.product_variant.sku,
            variant_name: cart_item.product_variant.display_name
          )

          subtotal_cents += item_total
        end

        order.subtotal_cents = subtotal_cents
        order.tax_cents = 0 # TODO: Calculate tax if needed
        order.total_cents = order.subtotal_cents + order.shipping_cost_cents + order.tax_cents

        order
      end

      def deduct_inventory(cart_items, order)
        cart_items.each do |item|
          variant = item.product_variant
          product = variant.product

          case product.inventory_level
          when "variant"
            # Use row locking to prevent race conditions
            variant.with_lock do
              previous_stock = variant.stock_quantity
              new_stock = previous_stock - item.quantity
              if new_stock < 0
                raise StandardError, "Not enough stock for #{variant.sku}"
              end
              variant.update!(stock_quantity: new_stock)

              # Create audit record inside the lock for atomicity
              InventoryAudit.record_order_placed(
                variant: variant,
                quantity: item.quantity,
                order: order,
                previous_qty: previous_stock
              )
            end

          when "product"
            # Decrement product-level stock with audit trail
            product.with_lock do
              previous_stock = product.product_stock_quantity || 0
              new_stock = previous_stock - item.quantity
              if new_stock < 0
                raise StandardError, "Not enough stock for #{product.name}"
              end
              product.update!(product_stock_quantity: new_stock)

              # Create audit record for product-level tracking
              InventoryAudit.record_product_stock_change(
                product: product,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Order ##{order.order_number} placed",
                audit_type: "order_placed",
                order: order
              )
            end

          when "none"
            # Do nothing - not tracking inventory
            next
          end
        end
      end

      def clear_cart(cart_items)
        cart_items.destroy_all
      end

      # Restore inventory when an order is cancelled
      def restore_inventory(order, user = nil)
        Payments::RestoreInventory.call(order: order, user: user)
      end

      def order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          payment_environment: order.payment_environment,
          payment_provider: order.payment_provider,
          inventory_restoration_status: order.metadata.dig('inventory_restoration', 'status'),
          system_cancellation: order.metadata["system_cancellation"]&.slice("actor", "reason"),
          order_type: order.order_type,
          business_line: infer_business_line(order),
          next_status_options: order.next_status_options,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          shipping_method: order.shipping_method,
          shipping_address_line1: order.shipping_address_line1,
          shipping_address_line2: order.shipping_address_line2,
          shipping_city: order.shipping_city,
          shipping_state: order.shipping_state,
          shipping_zip: order.shipping_zip,
          shipping_country: order.shipping_country,
          fulfillment_type: order.fulfillment_type,
          location_id: order.location_id,
          location_name: order.location&.name,
          created_at: order.created_at.iso8601,
          item_count: order.order_items.sum(&:quantity),
          line_count: order.order_items.size,
          updated_at: order.updated_at.iso8601,
          notes: order.notes,
          admin_notes: order.admin_notes,
          tracking_number: order.tracking_number,
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

        json
      end

      def detailed_order_json(order)
        json = order_json(order).merge(
          total_formatted: "$#{'%.2f' % (order.total_cents / 100.0)}",
          tracking_number: order.tracking_number,
          admin_notes: order.admin_notes
        )

        json[:total_refunded_cents] = order.total_refunded_cents
        json[:refundable_amount_cents] = order.refundable_amount_cents
        json[:payment_receipt] = Payments::ReceiptFacts.for_order(order)
        # Add refund history
        json[:refunds] = order.refunds.recent.map { |r| refund_json(r) }

        json
      end

      def refund_json(refund)
        {
          id: refund.id,
          amount_cents: refund.amount_cents,
          amount_formatted: "$#{'%.2f' % (refund.amount_cents / 100.0)}",
          status: refund.status,
          reason: refund.reason,
          stripe_refund_id: refund.stripe_refund_id,
          operation_uuid: refund.refund_operation_id,
          operation_status: refund.refund_operation&.state,
          environment: refund.refund_operation&.environment,
          restoration_status: refund.metadata.dig('inventory_restoration', 'status'),
          created_at: refund.created_at.iso8601,
          admin_user: refund.user&.name || refund.user&.email
        }
      end

      def order_params
        params.require(:order).permit(
          :email, :phone,
          :customer_name, :customer_email, :customer_phone,
          :shipping_address_line1, :shipping_address_line2,
          :shipping_city, :shipping_state, :shipping_zip, :shipping_country,
          shipping_address: [ :name, :street1, :street2, :city, :state, :zip, :country ],
          shipping_method: [ :carrier, :service, :rate_cents, :rate_id ],
          payment_method: [ :token, :type ]
        )
      end

      def order_update_params
        params.require(:order).permit(:status, :admin_notes, :tracking_number)
      end
    end
    end
  end
end
