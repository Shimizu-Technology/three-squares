# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PosOrdersController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!

        # POST /api/v1/admin/pos/orders/:id/confirm_terminal_payment
        # Called after Stripe Terminal SDK successfully processes a card_present payment
        def confirm_terminal_payment
          order = Order.find(params[:id])

          unless order.staff_created? && order.source == "pos"
            return render json: { error: "Not a POS order" }, status: :forbidden
          end

          unless order.payment_method == "card_present" && order.payment_intent_id.present?
            return render json: { error: "Order is not a terminal payment" }, status: :unprocessable_entity
          end

          # Verify the PaymentIntent status with Stripe
          Stripe.api_key = ENV["STRIPE_SECRET_KEY"]
          intent = Stripe::PaymentIntent.retrieve(order.payment_intent_id)

          if intent.status == "succeeded"
            order.update!(status: "confirmed", payment_status: "paid")
            render json: pos_order_json(order)
          elsif intent.status == "requires_capture"
            captured = intent.capture
            order.update!(status: "confirmed", payment_status: "paid")
            render json: pos_order_json(order)
          else
            render json: { error: "Payment not completed. Status: #{intent.status}" }, status: :unprocessable_entity
          end
        rescue Stripe::StripeError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/pos/orders
        # Create a POS order (staff-created, in-person)
        def create
          ActiveRecord::Base.transaction do
            @order = build_pos_order
            @order.save!

            build_order_items(@order, pos_params[:items])
            @order.save! # persist items so calculate_totals! can query them
            @order.calculate_totals!

            process_payment(@order)

            @order.save!
            deduct_inventory(@order)
          end

          render json: pos_order_json(@order), status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { error: e.message }, status: :unprocessable_entity
        rescue StandardError => e
          Rails.logger.error "POS order creation failed: #{e.message}"
          render json: { error: e.message }, status: :unprocessable_entity
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
            location_id: pos_params[:location_id],
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

            # Check availability
            unless product.published?
              raise StandardError, "#{product.name} is not available"
            end

            unit_price_cents = variant.price_cents

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

        def process_payment(order)
          case order.payment_method
          when "cash"
            process_cash_payment(order)
          when "stripe"
            process_stripe_payment(order)
          when "card_present"
            process_terminal_payment(order)
          else
            raise StandardError, "Unknown payment method: #{order.payment_method}"
          end
        end

        def process_cash_payment(order)
          cash_received = pos_params[:cash_received_cents]&.to_i || order.total_cents

          if cash_received < order.total_cents
            raise StandardError, "Cash received ($#{cash_received / 100.0}) is less than total ($#{order.total_cents / 100.0})"
          end

          order.cash_received_cents = cash_received
          order.cash_change_cents = cash_received - order.total_cents
          order.status = "confirmed"
          order.payment_status = "paid"
        end

        def process_terminal_payment(order)
          # Terminal payments use card_present — the frontend SDK handles
          # card collection and processing. We create the PaymentIntent with
          # card_present payment method type and manual capture.
          order.status = "pending"
          order.payment_status = "pending"

          order.save! unless order.persisted?

          stripe_key = ENV["STRIPE_SECRET_KEY"]
          if stripe_key.present?
            Stripe.api_key = stripe_key
            intent = Stripe::PaymentIntent.create(
              amount: order.total_cents,
              currency: "usd",
              payment_method_types: [ "card_present" ],
              capture_method: "automatic",
              metadata: {
                order_id: order.id,
                order_number: order.order_number,
                source: "pos_terminal"
              }
            )
            order.payment_intent_id = intent.id
            @client_secret = intent.client_secret
          else
            raise StandardError, "Stripe is not configured"
          end
        end

        def process_stripe_payment(order)
          # Create a Stripe PaymentIntent — frontend will complete payment
          # For now, order stays pending until webhook confirms
          order.status = "pending"
          order.payment_status = "pending"

          # Save order first so order.id is available for metadata
          order.save! unless order.persisted?

          # If Stripe is configured, create a PaymentIntent
          stripe_key = ENV["STRIPE_SECRET_KEY"]
          if stripe_key.present?
            Stripe.api_key = stripe_key
            intent = Stripe::PaymentIntent.create(
              amount: order.total_cents,
              currency: "usd",
              metadata: {
                order_id: order.id,
                source: "pos"
              }
            )
            order.payment_intent_id = intent.id
            @client_secret = intent.client_secret
          end
        end

        def deduct_inventory(order)
          order.order_items.includes(product_variant: :product).each do |item|
            variant = item.product_variant
            product = variant.product

            case product.inventory_level
            when "variant"
              variant.with_lock do
                previous_stock = variant.stock_quantity
                if previous_stock < item.quantity
                  raise StandardError, "#{item.product_name} — only #{previous_stock} in stock"
                end
                new_stock = previous_stock - item.quantity
                variant.update!(stock_quantity: new_stock)

                InventoryAudit.record_order_placed(
                  variant: variant,
                  quantity: item.quantity,
                  order: order,
                  previous_qty: previous_stock
                )
              end

            when "product"
              product.with_lock do
                previous_stock = product.product_stock_quantity || 0
                if previous_stock < item.quantity
                  raise StandardError, "#{item.product_name} — only #{previous_stock} in stock"
                end
                new_stock = previous_stock - item.quantity
                product.update!(product_stock_quantity: new_stock)

                InventoryAudit.record_product_stock_change(
                  product: product,
                  previous_qty: previous_stock,
                  new_qty: new_stock,
                  reason: "POS Order ##{order.order_number} placed",
                  audit_type: "order_placed",
                  order: order
                )
              end
            end
          end
        end

        def pos_order_json(order)
          json = {
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            payment_status: order.payment_status,
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
