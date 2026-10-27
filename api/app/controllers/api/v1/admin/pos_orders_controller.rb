# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PosOrdersController < ApplicationController
        before_action { Payments::Configuration.validate_database! }
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!

        def confirm_terminal_payment
          order = Order.find(params[:id])
          if current_user.location_scoped? && order.location_id != current_user.assigned_location_id
            return render json: { error: "Order not found" }, status: :not_found
          end
          unless order.source == "pos" && order.staff_created? && order.payment_attempt_id
            return render json: { error: "This payment requires reconciliation" }, status: :conflict
          end
          Payments::ReconcileAttempt.call(attempt: PaymentAttempt.find(order.payment_attempt_id))
          order.reload
          render json: pos_order_json(order), status: order.payment_status == "paid" ? :ok : :accepted
        rescue Payments::Error, Payments::FulfillmentError, Payments::ReserveInventory::Unavailable, Payments::Configuration::UnsafeConfiguration, Stripe::StripeError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        def create
          key = request.headers["Idempotency-Key"].to_s
          raise Payments::Error, "Idempotency-Key is required" unless key.match?(/\A[a-zA-Z0-9_-]{16,100}\z/)
          attrs = pos_params.to_h.merge("fulfillment_type" => "pickup", "location_id" => current_user.location_scoped? ? current_user.assigned_location_id : pos_params[:location_id])
          attrs["payment_method"] ||= "cash"
          owner = "user:#{current_user.id}"
          rejected = nil
          ActiveRecord::Base.transaction do
            lock_number = Digest::SHA256.hexdigest("pos:#{current_user.id}:#{key}")[0,15].to_i(16)
            ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{lock_number})")
            refused = RejectedPaymentRequest.find_by(owner_key: owner, caller_idempotency_key: key)
            if refused
              rejected = refused.reason
              next
            end
            begin
              Order.transaction(requires_new: true) do
                cash_key = "#{current_user.id}:#{key}"
                @order = if attrs["payment_method"] == "cash"
                  Order.where(source: "pos", payment_method: "cash").find_by("metadata ->> 'cash_request_key' = ?", cash_key)
                else
                  CheckoutSession.find_by(owner_key: owner, caller_idempotency_key: key)&.order
                end
                if @order
                  digest = @order.cash_payment? ? @order.metadata["request_digest"] : CheckoutSession.find(@order.checkout_session_id).snapshot["request_digest"]
                  raise Payments::Conflict, "Idempotency key was reused for different order details" unless digest == Payments::Snapshot.digest(attrs)
                else
                  @order = build_pos_order
                  @order.save!
                  build_order_items(@order, pos_params[:items])
                  @order.save!
                  @order.calculate_totals!
                  @order.save!
                  Payments::Eligibility.validate_order!(@order)
                  if @order.payment_method == "cash"
                    process_cash_payment(@order)
                    @order.payment_environment = Payments::Configuration.production? ? "production" : "sandbox"
                    @order.payment_status = "pending"
                    @order.status = "pending"
                    @order.metadata = @order.metadata.merge("cash_request_key" => cash_key, "request_digest" => Payments::Snapshot.digest(attrs))
                    @order.save!
                    Payments::ReserveInventory.call(order: @order, expires_at: 30.minutes.from_now)
                    Payments::FinalizeOrder.call_cash(order: @order)
                  else
                    session = Payments::CreateCheckout.call(user: current_user, capability: nil, idempotency_key: key,
                      cart_items: @order.order_items.to_a, attributes: attrs, channel: "pos", existing_order: @order)
                    @order = session.order
                  end
                end
              end
            rescue Payments::Conflict
              raise
            rescue Payments::Error, Payments::FulfillmentError, Payments::ReserveInventory::Unavailable, ActiveRecord::RecordInvalid, CheckoutPricingService::PricingError => error
              # This savepoint contains no processor I/O. A persisted refusal
              # prevents a delayed duplicate request from ever using this key.
              rejected = error.message
              RejectedPaymentRequest.create!(owner_key: owner, caller_idempotency_key: key,
                payload_digest: Payments::Snapshot.digest(attrs), reason: rejected)
            end
          end
          return render json: { error: rejected, outcome: "rejected", no_attempt: true }, status: :unprocessable_entity if rejected
          if @order.payment_attempt_id
            attempt = PaymentAttempt.find(@order.payment_attempt_id)
            Payments::SetupAttempt.call(attempt: attempt)
            @client_secret = attempt.reload.collection_config["client_secret"] if attempt.state == "collecting"
          end
          render json: pos_order_json(@order.reload), status: :created
        rescue Payments::Conflict => error
          render json: { error: error.message, outcome: "unknown" }, status: :conflict
        rescue Payments::Error, Payments::FulfillmentError, Payments::ReserveInventory::Unavailable, Payments::Configuration::UnsafeConfiguration, ActiveRecord::RecordInvalid, CheckoutPricingService::PricingError, Stripe::StripeError => error
          render json: { error: error.message, outcome: "unknown" }, status: :unprocessable_entity
        end

        private

        def build_pos_order
          Order.new(
            source: "pos",
            staff_created: true,
            created_by_user_id: current_user.id,
            order_type: pos_params[:order_type] || "pickup",
            fulfillment_type: "pickup", # POS orders are always pickup
            customer_name: pos_params[:customer_name] || "Walk-in",
            customer_email: pos_params[:customer_email],
            customer_phone: pos_params[:customer_phone],
            location_id: current_user.location_scoped? ? current_user.assigned_location_id : pos_params[:location_id],
            notes: pos_params[:special_instructions],
            payment_method: pos_params[:payment_method] || "cash",
            status: "pending",
            payment_status: "pending",
            subtotal_cents: 0,
            tax_cents: 0,
            shipping_cost_cents: 0,
            total_cents: 0
          )
        end

        def build_order_items(order, items_data)
          return if items_data.blank?

          items_data.each do |item_data|
            variant = ProductVariant.find(item_data[:product_variant_id])
            product = variant.product
            quantity = (item_data[:quantity] || 1).to_i

            Payments::Eligibility.validate_product!(variant: variant, location_id: order.location_id, online: false)

            unit_price_cents = variant.effective_unit_price_cents(location_id: order.location_id)

            order.order_items.build(
              product_variant: variant,
              product_id: product.id,
              quantity: quantity,
              unit_price_cents: unit_price_cents,
              total_price_cents: unit_price_cents * quantity,
              product_name: product.name,
              product_sku: variant.sku,
              variant_name: variant.display_name
            )
          end
        end

        def process_cash_payment(order)
          cash_received = pos_params[:cash_received_cents]&.to_i || order.total_cents

          if cash_received < order.total_cents
            raise Payments::Error, "Cash received ($#{cash_received / 100.0}) is less than total ($#{order.total_cents / 100.0})"
          end

          order.cash_received_cents = cash_received
          order.cash_change_cents = cash_received - order.total_cents
          order.status = "confirmed"
          order.payment_status = "paid"
        end

        def pos_order_json(order)
          json = {
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            payment_status: order.payment_status,
            payment_environment: order.payment_environment,
            checkout_session_id: order.checkout_session_id,
            payment_state: order.payment_attempt_id ? PaymentAttempt.find(order.payment_attempt_id).state : nil,
            inventory_committed: order.inventory_committed_at.present?,
            source: order.source,
            order_type: order.order_type,
            payment_method: order.payment_method,
            customer_name: order.customer_name,
            subtotal_cents: order.subtotal_cents,
            tax_cents: order.tax_cents,
            total_cents: order.total_cents,
            total_formatted: "$#{'%.2f' % (order.total_cents / 100.0)}",
            location_id: order.location_id,
            location_name: order.location&.name,
            created_at: order.created_at.iso8601,
            items: order.order_items.map do |item|
              {
                id: item.id,
                product_name: item.product_name,
                variant_name: item.variant_name,
                quantity: item.quantity,
                unit_price_cents: item.unit_price_cents,
                total_price_cents: item.total_price_cents
              }
            end
          }

          # Cash payment details
          if order.cash_payment?
            json[:cash_received_cents] = order.cash_received_cents
            json[:cash_change_cents] = order.cash_change_cents
            json[:change_due_formatted] = "$#{'%.2f' % ((order.cash_change_cents || 0) / 100.0)}"
          end

          # Stripe client secret for card payments
          json[:client_secret] = @client_secret if @client_secret.present?

          json
        end

        def pos_params
          params.require(:order).permit(
            :customer_name, :customer_email, :customer_phone,
            :order_type, :location_id, :payment_method,
            :special_instructions, :cash_received_cents,
            items: [:product_variant_id, :quantity]
          )
        end
      end
    end
  end
end
