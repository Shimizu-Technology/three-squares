# frozen_string_literal: true

module Api
  module V1
    class ShippingController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request # Allow unauthenticated users to get shipping rates
      before_action :authenticate_optional

      # POST /api/v1/shipping/rates
      # Calculate shipping rates for cart items
      def calculate_rates
        # Validate address input before calling shipping provider
        address = params[:address] || {}
        missing_fields = []
        missing_fields << "zip" if address[:zip].blank?
        missing_fields << "country" if address[:country].blank?
        missing_fields << "city" if address[:city].blank?
        missing_fields << "state" if address[:state].blank?
        missing_fields << "street" if address[:street].blank? && address[:street1].blank?

        if missing_fields.any?
          return render json: {
            error: "Missing required address fields: #{missing_fields.join(', ')}",
            missing_fields: missing_fields
          }, status: :unprocessable_entity
        end

        cart_items = get_cart_items

        if cart_items.empty?
          return render json: { error: "Cart is empty" }, status: :unprocessable_entity
        end

        destination = shipping_address_params
        rates = ShippingService.calculate_rates(cart_items, destination)

        render json: {
          rates: rates,
          total_weight_oz: cart_items.sum { |item| (item.product_variant.weight_oz || 0) * item.quantity }
        }
      rescue ShippingService::ShippingError => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue StandardError => e
        Rails.logger.error "Shipping rates error: #{e.message}"
        render json: { error: "Failed to calculate shipping rates" }, status: :internal_server_error
      end

      # POST /api/v1/shipping/validate_address
      # Validate a shipping address
      def validate_address
        address = shipping_address_params
        validated = ShippingService.validate_address(address)

        render json: { address: validated }
      rescue ShippingService::ShippingError => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue StandardError => e
        Rails.logger.error "Address validation error: #{e.message}"
        render json: { error: "Failed to validate address" }, status: :internal_server_error
      end

      private

      def get_cart_items
        session_id = request.headers["X-Session-ID"] || cookies[:session_id]
        if session_id.present?
          return CartItem.where(session_id: session_id).includes(product_variant: { product: :product_images })
        end

        return [] unless current_user

        current_user.cart_items.includes(product_variant: { product: :product_images })
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

      def shipping_address_params
        params.require(:address).permit(
          :name,
          :street1,
          :street2,
          :city,
          :state,
          :zip,
          :country,
          :phone
        ).to_h.symbolize_keys
      end
    end
  end
end
