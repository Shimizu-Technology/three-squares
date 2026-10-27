# frozen_string_literal: true

module Webhooks
  class WorldpayController < ApplicationController
    before_action :set_raw_body

    # POST /webhooks/worldpay
    #
    # This endpoint is intentionally conservative until BOG/Worldpay confirms
    # the exact product, event payloads, and signature scheme for this merchant.
    def create
      unless worldpay_webhook_configured?
        Rails.logger.error "Worldpay webhook received before WORLDPAY_WEBHOOK_SECRET is configured"
        return head :service_unavailable
      end

      Rails.logger.info "Worldpay webhook received bytes=#{@raw_body.bytesize}"
      head :not_implemented
    end

    private

    def set_raw_body
      @raw_body = request.body.read
    end

    def worldpay_webhook_configured?
      ENV["WORLDPAY_WEBHOOK_SECRET"].present?
    end
  end
end
