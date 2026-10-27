# frozen_string_literal: true

module Api
  module V1
    class ConfigController < ApplicationController
      # GET /api/v1/config
      # Returns app configuration for frontend
      def show
        settings = SiteSetting.instance

        profiles = PaymentProfile.includes(:payment_identity).where(enabled: true, provider: settings.payment_processor, channel: "online")
        profile = profiles.find_by(location_id: params[:location_id].presence) || profiles.find_by(location_id: nil)
        identity = profile&.payment_identity
        environment = identity&.environment
        key = if identity&.provider == "stripe"
          ENV[environment == "production" ? "STRIPE_PUBLISHABLE_KEY" : "STRIPE_PUBLISHABLE_KEY_TEST"]
        end
        render json: {
          app_mode: environment == "production" ? "production" : "test",
          payment_test_mode: environment != "production",
          payment_environment: environment,
          payment_processor: settings.payment_processor,
          stripe_publishable_key: key,
          stripe_account_id: identity&.external_account_id,
          payment_identity_id: identity&.id,
          placeholder_image_url: settings.placeholder_image_url,
          features: {
            payments: identity.present?,
            shipping: ENV["EASYPOST_API_KEY"].present?
          },
          store_info: {
            name: settings.store_name,
            email: settings.store_email,
            phone: settings.store_phone
          },
          announcement_enabled: settings.announcement_enabled,
          announcement_text: settings.announcement_text,
          announcement_style: settings.announcement_style,
          enable_storefront_three_squares: settings.enable_storefront_three_squares,
          enable_storefront_latte_stone: settings.enable_storefront_latte_stone,
          enable_storefront_catering: settings.enable_storefront_catering
        }
      end

      private

      def stripe_publishable_key(settings)
        if settings.test_mode?
          ENV["STRIPE_PUBLISHABLE_KEY_TEST"] || ENV["STRIPE_PUBLISHABLE_KEY"]
        else
          ENV["STRIPE_PUBLISHABLE_KEY"]
        end
      end
    end
  end
end
