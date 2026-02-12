# frozen_string_literal: true

module Api
  module V1
    module Admin
      class StripeTerminalController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!

        # POST /api/v1/admin/stripe_terminal/connection_token
        # Returns a connection token for the Stripe Terminal JS SDK
        def connection_token
          token = Stripe::Terminal::ConnectionToken.create
          render json: { secret: token.secret }
        rescue Stripe::StripeError => e
          Rails.logger.error "Stripe Terminal connection token error: #{e.message}"
          render json: { error: e.message }, status: :bad_request
        end

        # GET /api/v1/admin/stripe_terminal/readers
        # Lists registered readers (for debugging/status)
        def readers
          readers = Stripe::Terminal::Reader.list({ limit: 10 })
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
      end
    end
  end
end
