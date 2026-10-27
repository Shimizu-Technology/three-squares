# frozen_string_literal: true

module Api
  module V1
    class PaymentIntentsController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request, only: [ :create ]
      before_action :authenticate_optional, only: [ :create ]

      # POST /api/v1/payment_intents
      # Creates a Stripe PaymentIntent for the current cart
      def create
        settings = SiteSetting.instance

        # Get cart items to calculate amount
        cart_items = get_cart_items
        if cart_items.empty?
          return render json: { error: "Cart is empty" }, status: :unprocessable_entity
        end

        fulfillment_type = params[:fulfillment_type].to_s == "pickup" ? "pickup" : "shipping"
        location_id = params[:location_id].presence&.to_i
        fulfillment_issues = FulfillmentValidator.validate_cart(
          cart_items: cart_items,
          fulfillment_type: fulfillment_type,
          location_id: location_id
        )
        if fulfillment_issues.any?
          friendly_error = fulfillment_issues.first[:message].presence || "Cart fulfillment validation failed"
          return render json: { error: friendly_error, issues: fulfillment_issues }, status: :unprocessable_entity
        end

        pricing = CheckoutPricingService.resolve!(
          cart_items: cart_items,
          fulfillment_type: fulfillment_type,
          shipping_address: checkout_shipping_address_params,
          shipping_method: checkout_shipping_method_params
        )
        total_cents = pricing.total_cents

        if total_cents <= 0
          return render json: { error: "Order total must be greater than zero" }, status: :unprocessable_entity
        end

        email = params[:email] || current_user&.email
        unless email.present?
          return render json: { error: "Email is required" }, status: :unprocessable_entity
        end

        # Create payment intent via PaymentService
        result = PaymentService.create_payment_intent(
          amount_cents: total_cents,
          customer_email: email,
          order_id: 0, # Will be set when order is created
          test_mode: settings.payment_test_mode
        )

        if result[:success]
          render json: {
            client_secret: result[:client_secret],
            payment_intent_id: result[:payment_intent_id],
            amount_cents: total_cents,
            subtotal_cents: pricing.subtotal_cents,
            shipping_cost_cents: pricing.shipping_cost_cents,
            shipping_method: pricing.shipping_method_label
          }, status: :ok
        else
          render json: { error: result[:error] }, status: :unprocessable_entity
        end
      rescue CheckoutPricingService::PricingError => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue StandardError => e
        Rails.logger.error "PaymentIntent creation error: #{e.class} - #{e.message}"
        Rails.logger.error e.backtrace.first(5).join("\n")
        render json: { error: "Failed to create payment intent. Please try again." }, status: :internal_server_error
      end

      private

      def get_cart_items
        sess_id = request.headers["X-Session-ID"] || request.cookies["session_id"]

        # Checkout should validate against the exact cart context shown in the UI.
        # When a session ID is present, prefer the session cart to avoid unexpected
        # merges with an existing account cart during payment-intent creation.
        if sess_id.present?
          CartItem.where(session_id: sess_id).includes(product_variant: { product: :product_locations })
        elsif current_user
          current_user.cart_items.includes(product_variant: { product: :product_locations })
        else
          CartItem.none
        end
      end

      # Merge session-based cart items to the logged-in user
      # This handles the case where a user added items before logging in
      def merge_session_cart_to_user(session_id)
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

      def checkout_shipping_address_params
        return {} unless params[:shipping_address].present?

        params.require(:shipping_address).permit(
          :name,
          :street1,
          :street2,
          :city,
          :state,
          :zip,
          :country,
          :phone
        ).to_h
      end

      def checkout_shipping_method_params
        return {} unless params[:shipping_method].present?

        params.require(:shipping_method).permit(:carrier, :service, :rate_cents, :rate_id).to_h
      end
    end
  end
end
