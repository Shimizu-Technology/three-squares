# frozen_string_literal: true

module Payments
  class WorldpayProvider < BaseProvider
    WORLDPAY_NOT_READY_MESSAGE = "Worldpay is selected, but the live online checkout integration is not enabled in this build yet.".freeze

    def create_checkout_session(**)
      {
        success: false,
        provider: "worldpay",
        flow: "hosted",
        error: WORLDPAY_NOT_READY_MESSAGE
      }
    end

    def process_payment(**)
      {
        success: false,
        error: WORLDPAY_NOT_READY_MESSAGE
      }
    end

    def refund_payment(**)
      {
        success: false,
        error: "Worldpay refunds are not enabled in this build yet."
      }
    end

    def verify_payment(**)
      {
        success: false,
        provider: "worldpay",
        captured: :unknown,
        error: WORLDPAY_NOT_READY_MESSAGE
      }
    end
  end
end
