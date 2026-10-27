# frozen_string_literal: true

module Api
  module V1
    class CheckoutSessionsController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request, only: [ :create ]
      before_action :authenticate_optional, only: [ :create ]

      # POST /api/v1/checkout_sessions
      # Creates a provider-aware checkout session for the current cart.
      def create
        settings = SiteSetting.instance

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

        result = PaymentService.create_checkout_session(
          amount_cents: total_cents,
          customer_email: email,
          order_id: 0,
          test_mode: settings.payment_test_mode,
          payment_processor: settings.payment_processor
        )

        if result[:success]
          render json: result.slice(:provider, :flow, :client_secret, :payment_reference, :payment_intent_id)
                            .merge(
                              amount_cents: total_cents,
                              subtotal_cents: pricing.subtotal_cents,
                              shipping_cost_cents: pricing.shipping_cost_cents,
                              shipping_method: pricing.shipping_method_label
                            ), status: :ok
        else
          render json: { error: result[:error] }, status: :unprocessable_entity
        end
      rescue CheckoutPricingService::PricingError => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue StandardError => e
        Rails.logger.error "CheckoutSession creation error: #{e.class} - #{e.message}"
        Rails.logger.error e.backtrace.first(5).join("\n")
        render json: { error: "Failed to initialize checkout. Please try again." }, status: :internal_server_error
      end

      private

      def get_cart_items
        sess_id = request.headers["X-Session-ID"] || request.cookies["session_id"]

        if sess_id.present?
          CartItem.where(session_id: sess_id).includes(product_variant: { product: :product_locations })
        elsif current_user
          current_user.cart_items.includes(product_variant: { product: :product_locations })
        else
          CartItem.none
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
