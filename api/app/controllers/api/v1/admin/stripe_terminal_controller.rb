# frozen_string_literal: true

module Api
  module V1
    module Admin
      class StripeTerminalController < ApplicationController
        before_action { Payments::Configuration.validate_database! }
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!
        before_action :ensure_stripe_configured!

        # POST /api/v1/admin/stripe_terminal/connection_token
        # Returns a connection token for the Stripe Terminal JS SDK
        def connection_token
          token = @provider.client.v1.terminal.connection_tokens.create
          render json: { secret: token.secret }
        rescue Stripe::StripeError => e
          Rails.logger.error "Stripe Terminal connection token error: #{e.message}"
          render json: { error: e.message }, status: :bad_request
        end

        # GET /api/v1/admin/stripe_terminal/readers
        # Lists registered readers (for debugging/status)
        def readers
          readers = @provider.client.v1.terminal.readers.list({ limit: 10 })
          render json: {
            readers: readers.data.map { |r|
              {
                id: r.id,
                label: r.label,
                serial_number: r.serial_number,
                device_type: r.device_type,
                status: r.status,
                ip_address: r.ip_address,
                location: r.location
              }
            }
          }
        rescue Stripe::StripeError => e
          render json: { error: e.message }, status: :bad_request
        end

        private

        def ensure_stripe_configured!
          location_id = current_user.location_scoped? ? current_user.assigned_location_id : request.headers["X-Location-ID"].presence
          profile = Payments::ProviderResolver.profile!(location_id: location_id, channel: "pos")
          raise Payments::UnsupportedCapability, "Selected profile is not Stripe Terminal" unless profile.payment_identity.provider == "stripe"
          @provider = Payments::ProviderResolver.for_identity(profile.payment_identity)
        rescue Payments::Error, Payments::Configuration::UnsafeConfiguration
          render json: { error: "Stripe Terminal is unavailable for this location" }, status: :service_unavailable
        end
      end
    end
  end
end
