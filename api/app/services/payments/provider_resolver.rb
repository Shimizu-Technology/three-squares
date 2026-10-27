# frozen_string_literal: true

module Payments
  class ProviderResolver
    def self.resolve(payment_processor:, test_mode:)
      return TestProvider.new if test_mode

      case payment_processor
      when "stripe"
        StripeProvider.new
      when "worldpay"
        WorldpayProvider.new
      when "paypal"
        raise PaymentService::PaymentError, "PayPal payments are not currently supported in checkout"
      else
        raise PaymentService::PaymentError, "Unsupported payment processor: #{payment_processor}"
      end
    end
  end
end
