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
          token = @provider.client.v1.terminal.connection_tokens.create({ location: @stripe_location_id })
          render json: { secret: token.secret, stripe_location_id: @stripe_location_id }
        rescue Stripe::StripeError => e
          Rails.logger.error "Stripe Terminal connection token error: #{e.message}"
          render json: { error: e.message }, status: :bad_request
        end

        # GET /api/v1/admin/stripe_terminal/readers
        # Lists registered readers (for debugging/status)
        def readers
          readers = @provider.client.v1.terminal.readers.list({ limit: 100, location: @stripe_location_id })
          render json: {
            stripe_location_id: @stripe_location_id,
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
          unless location_id.to_s.match?(/\A[1-9][0-9]*\z/) && Location.where(active: true).exists?(id: location_id)
            raise Payments::Configuration::UnsafeConfiguration, "Select an active POS location"
          end
          profile = Payments::ProviderResolver.profile!(location_id: location_id, channel: "pos")
          raise Payments::UnsupportedCapability, "Selected profile is not Stripe Terminal" unless profile.payment_identity.provider == "stripe"
          @stripe_location_id = profile.capabilities.fetch("stripe_terminal_locations", {})[location_id.to_s]
          if profile.location_id.to_s == location_id.to_s
            @stripe_location_id ||= profile.capabilities["stripe_terminal_location_id"]
          end
          unless @stripe_location_id.is_a?(String) && @stripe_location_id.match?(/\Atml_[A-Za-z0-9]{1,128}\z/)
            raise Payments::Configuration::UnsafeConfiguration, "Stripe reader location is not assigned"
          end
          @provider = Payments::ProviderResolver.for_identity(profile.payment_identity)
        rescue Payments::Error, Payments::Configuration::UnsafeConfiguration
          render json: { error: "Stripe Terminal is unavailable for this location" }, status: :service_unavailable
        end
      end
    end
  end
end
