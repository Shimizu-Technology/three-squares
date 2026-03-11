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
        before_action :set_order, only: [ :show, :update, :notify, :refund ]

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
        orders = filtered_orders_query.except(:includes, :order)

        status_counts = orders.group(:status).count
        total_orders = orders.count
        paid_orders = orders.where(payment_status: "paid").count
        total_revenue_cents = orders.where(payment_status: "paid").sum(:total_cents)

        render json: {
          total_orders: total_orders,
          paid_orders: paid_orders,
          total_revenue_cents: total_revenue_cents,
          status_counts: status_counts
        }
      end

      # GET /api/v1/admin/orders/:id
      # Get single order details
      def show
        render json: { order: detailed_order_json(@order) }
      end

      # PATCH/PUT /api/v1/admin/orders/:id
      # Update order (status, tracking, notes)
      def update
        if @order.update(order_update_params)
          notification_warnings = []

          # Handle status changes — send notifications via both channels
          if @order.saved_change_to_status?
            sent = send_status_notifications(@order)
            notification_warnings = sent[:warnings] if sent[:warnings]&.any?

            # Restore inventory when order is cancelled
            restore_inventory(@order, current_user) if @order.status == "cancelled"
          end

          response = {
            order: detailed_order_json(@order),
            message: "Order updated successfully"
          }
          response[:notification_warnings] = notification_warnings if notification_warnings.any?

          render json: response
        else
          render json: { error: @order.errors.full_messages.join(", ") }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/admin/orders/:id/notify
      # Resend notification to customer (email + SMS) for current status
      def notify
        # Block resend for pending (no notification exists) and terminal statuses
        # (re-notifying "cancelled" or "delivered" would confuse customers)
        blocked = %w[pending cancelled delivered picked_up]
        if @order.status.in?(blocked)
          render json: { error: "Cannot resend notification for '#{@order.status}' orders" }, status: :unprocessable_entity
          return
        end

        # Force resend: reset seq counters for THIS status only
        sent = send_status_notifications(@order, force: true)

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
        amount_cents = params[:amount_cents].to_i
        reason = params[:reason]
        # Optional: restock specific items or all items
        # - restock_items: true = restock all order items
        # - restock_items: [item_id, item_id, ...] = restock specific items
        restock_items = params[:restock_items]

        # Validate amount
        if amount_cents <= 0
          return render json: { error: "amount_cents must be greater than 0" }, status: :unprocessable_entity
        end

        # Validate the order can be refunded
        unless @order.can_refund?
          return render json: { error: "This order cannot be refunded" }, status: :unprocessable_entity
        end

        # Validate amount doesn't exceed refundable amount
        if amount_cents > @order.refundable_amount_cents
          return render json: {
            error: "Refund amount exceeds refundable amount (max: #{@order.refundable_amount_cents} cents)"
          }, status: :unprocessable_entity
        end

        # Determine test mode
        test_mode = ENV["APP_MODE"] == "test"

        # Process the refund
        result = PaymentService.refund_payment(
          order: @order,
          amount_cents: amount_cents,
          reason: reason,
          admin_user: current_user,
          test_mode: test_mode
        )

        if result[:success]
          refund = result[:refund]
          # Update payment status if fully refunded
          if @order.reload.fully_refunded?
            @order.update!(payment_status: "refunded")
          end

          # Restore inventory based on restock_items parameter
          inventory_restored = false
          if @order.fully_refunded?
            # Always restore inventory for full refunds
            restore_inventory_for_refund(@order, current_user)
            inventory_restored = true
          elsif restock_items.present?
            # Partial refund with explicit restock request
            if restock_items == true || restock_items == "true" || restock_items == "all"
              # Restock all items
              restore_inventory_for_refund(@order, current_user)
              inventory_restored = true
            elsif restock_items.is_a?(Array)
              # Restock specific items by order_item_id
              restore_inventory_for_items(@order, restock_items, current_user)
              inventory_restored = true
            end
          end

          # Send refund notifications asynchronously (email + SMS)
          # Avoids blocking the refund response on slow Resend/ClickSend API calls
          SendRefundNotificationJob.perform_later(refund.id)

          render json: {
            message: "Refund processed successfully",
            inventory_restored: inventory_restored,
            refund: refund_json(refund),
            order: detailed_order_json(@order.reload)
          }
        else
          render json: {
            error: "Refund failed",
            details: result[:error] || "An error occurred processing the refund"
          }, status: :unprocessable_entity
        end
      rescue StandardError => e
        Rails.logger.error "Refund error for order ##{@order.order_number}: #{e.message}"
        render json: { error: "Refund failed: #{e.message}" }, status: :internal_server_error
      end


      private

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
        seq = order.notification_seq

        # Statuses that don't have notification templates
        unless Order::STATUS_SEQUENCE.key?(event) && event != "pending"
          warnings << "No notification template for status '#{event}'"
          return { any: false, email: false, sms: false, warnings: warnings }
        end

        # Shipped requires tracking number
        if event == "shipped" && order.tracking_number.blank?
          warnings << "No tracking number — shipped notifications require tracking info"
          return { any: false, email: false, sms: false, warnings: warnings }
        end

        will_email = emails_on && has_email
        will_sms = sms_on && has_phone

        email_sent = false
        sms_sent = false

        # For force-resend: reset seq, then enqueue. If enqueue fails (Redis
        # down), restore seq so the dedup window isn't left open.
        if force
          cols = {}
          cols[:last_email_seq] = seq - 1 if will_email
          cols[:last_sms_seq] = seq - 1 if will_sms
          order.update_columns(cols) if cols.any?
        end

        begin
          if will_email
            SendOrderStatusEmailJob.perform_later(order.id, event, seq)
            email_sent = true
          end
          if will_sms
            SendOrderSmsJob.perform_later(order.id, event, seq)
            sms_sent = true
          end
        rescue StandardError => e
          # Restore seq counters if enqueue failed — don't leave the window open
          if force
            restore = {}
            restore[:last_email_seq] = seq if will_email && !email_sent
            restore[:last_sms_seq] = seq if will_sms && !sms_sent
            order.update_columns(restore) if restore.any?
          end
          raise
        end

        warnings << "Email enabled but customer has no email address" if emails_on && !has_email
        warnings << "SMS enabled but customer has no phone number" if sms_on && !has_phone

        { any: email_sent || sms_sent, email: email_sent, sms: sms_sent, warnings: warnings }
      end

      def filtered_orders_query
        orders_query = Order
          .includes(order_items: { product_variant: { product: :collections } }, user: [], location: [])
          .order(created_at: :desc)

        orders_query = orders_query.where(status: params[:status]) if params[:status].present?
        orders_query = orders_query.where(payment_status: params[:payment_status]) if params[:payment_status].present?
        orders_query = orders_query.where(order_type: params[:order_type]) if params[:order_type].present?
        orders_query = orders_query.where(fulfillment_type: params[:fulfillment_type]) if params[:fulfillment_type].present?
        orders_query = orders_query.where(location_id: params[:location_id].to_i) if params[:location_id].present?

        if params[:search].present?
          search_term = "%#{params[:search]}%"
          orders_query = orders_query.where(
            "order_number ILIKE ? OR customer_email ILIKE ? OR customer_name ILIKE ?",
            search_term, search_term, search_term
          )
        end

        start_at = parse_datetime_param(params[:start_date])
        end_at = parse_datetime_param(params[:end_date], end_of_day: true)
        orders_query = orders_query.where("created_at >= ?", start_at) if start_at
        orders_query = orders_query.where("created_at <= ?", end_at) if end_at

        if params[:business_line].present?
          orders_query = apply_business_line_filter(orders_query, params[:business_line].to_s)
        end

        orders_query
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
          relation
            .where(order_type: "retail")
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .distinct
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
            "total_usd"
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
              format("%.2f", (order.total_cents || 0) / 100.0)
            ]
          end
        end
      end

      def set_order
        @order = Order.includes(:order_items, :user, :refunds).find(params[:id])
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
        order.order_items.includes(product_variant: :product).each do |item|
          variant = item.product_variant
          next unless variant # Skip if variant was deleted

          product = variant.product

          case product.inventory_level
          when "variant"
            variant.with_lock do
              previous_stock = variant.stock_quantity
              new_stock = previous_stock + item.quantity
              variant.update!(stock_quantity: new_stock)

              # Create audit record for cancellation
              InventoryAudit.record_order_cancelled(
                variant: variant,
                quantity: item.quantity,
                order: order,
                user: user
              )
            end

          when "product"
            product.with_lock do
              previous_stock = product.product_stock_quantity || 0
              new_stock = previous_stock + item.quantity
              product.update!(product_stock_quantity: new_stock)

              # Create audit record for product-level tracking
              InventoryAudit.record_product_stock_change(
                product: product,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Order ##{order.order_number} cancelled - stock restored",
                audit_type: "order_cancelled",
                order: order,
                user: user
              )
            end
          end
        end

        Rails.logger.info "📦 Inventory restored for cancelled order ##{order.order_number}"
      end

      def order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          order_type: order.order_type,
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
          created_at: order.created_at.iso8601,
          item_count: order.order_items.count,
          order_items: order.order_items.map do |item|
            {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
          end
        }

        json
      end

      def detailed_order_json(order)
        json = {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          order_type: order.order_type,
          customer_name: order.name,
          customer_email: order.email,
          customer_phone: order.phone,
          subtotal_cents: order.subtotal_cents,
          shipping_cost_cents: order.shipping_cost_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          total_formatted: "$#{'%.2f' % (order.total_cents / 100.0)}",
          created_at: order.created_at.iso8601,
          updated_at: order.updated_at.iso8601,
          shipping_method: order.shipping_method,
          shipping_address_line1: order.shipping_address_line1,
          shipping_address_line2: order.shipping_address_line2,
          shipping_city: order.shipping_city,
          shipping_state: order.shipping_state,
          shipping_zip: order.shipping_zip,
          shipping_country: order.shipping_country,
          tracking_number: order.tracking_number,
          admin_notes: order.admin_notes,
          notes: order.notes,
          order_items: order.order_items.map do |item|
            {
              id: item.id,
              product_name: item.product_name,
              variant_name: item.variant_name,
              product_sku: item.product_sku,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_price_cents: item.total_price_cents
            }
          end
        }

        json[:total_refunded_cents] = order.total_refunded_cents
        json[:refundable_amount_cents] = order.refundable_amount_cents
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
          created_at: refund.created_at.iso8601,
          admin_user: refund.user&.name || refund.user&.email
        }
      end

      # Restore inventory when a full refund is processed
      def restore_inventory_for_refund(order, user = nil)
        order.order_items.includes(product_variant: :product).each do |item|
          variant = item.product_variant
          next unless variant

          product = variant.product

          case product.inventory_level
          when "variant"
            variant.with_lock do
              previous_stock = variant.stock_quantity
              new_stock = previous_stock + item.quantity
              variant.update!(stock_quantity: new_stock)

              InventoryAudit.record_order_refunded(
                variant: variant,
                quantity: item.quantity,
                order: order,
                user: user
              )
            end

          when "product"
            product.with_lock do
              previous_stock = product.product_stock_quantity || 0
              new_stock = previous_stock + item.quantity
              product.update!(product_stock_quantity: new_stock)

              InventoryAudit.record_product_stock_change(
                product: product,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Order ##{order.order_number} refunded - stock restored",
                audit_type: "order_refunded",
                order: order,
                user: user
              )
            end
          end
        end

        Rails.logger.info "Inventory restored for refunded order ##{order.order_number}"
      end

      # Restore inventory for specific order items (for partial refunds)
      def restore_inventory_for_items(order, item_ids, user = nil)
        items = order.order_items.where(id: item_ids).includes(product_variant: :product)

        items.each do |item|
          variant = item.product_variant
          next unless variant

          product = variant.product

          case product.inventory_level
          when "variant"
            variant.with_lock do
              previous_stock = variant.stock_quantity
              new_stock = previous_stock + item.quantity
              variant.update!(stock_quantity: new_stock)

              InventoryAudit.record_order_refunded(
                variant: variant,
                quantity: item.quantity,
                order: order,
                user: user
              )
            end

          when "product"
            product.with_lock do
              previous_stock = product.product_stock_quantity || 0
              new_stock = previous_stock + item.quantity
              product.update!(product_stock_quantity: new_stock)

              InventoryAudit.record_product_stock_change(
                product: product,
                previous_qty: previous_stock,
                new_qty: new_stock,
                reason: "Partial refund for Order ##{order.order_number} - stock restored",
                audit_type: "order_refunded",
                order: order,
                user: user
              )
            end
          end
        end

        Rails.logger.info "Inventory restored for #{items.count} items from partial refund on order ##{order.order_number}"
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
