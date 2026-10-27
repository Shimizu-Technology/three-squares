# frozen_string_literal: true

module Api
  module V1
    class ConfigController < ApplicationController
      # GET /api/v1/config
      # Returns app configuration for frontend
      def show
        settings = SiteSetting.instance

        render json: {
          app_mode: settings.payment_test_mode ? "test" : "production",
          payment_test_mode: settings.payment_test_mode,
          payment_processor: settings.payment_processor,
          supported_live_payment_processors: SiteSetting::LIVE_PAYMENT_PROCESSORS,
          payment_checkout_mode: payment_checkout_mode(settings),
          stripe_publishable_key: stripe_publishable_key(settings),
          placeholder_image_url: settings.placeholder_image_url,
          features: {
            payments: true, # Always enabled (test mode or production mode)
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

      def payment_checkout_mode(settings)
        return "simulated" if settings.test_mode?
        return "embedded" if settings.using_stripe?

        "unsupported"
      end
    end
  end
end
