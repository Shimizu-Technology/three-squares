# frozen_string_literal: true

# Compatibility facade. Collection always requires a persisted checkout attempt.
class PaymentService
  def self.process_payment(**)
    { success: false, error: "Use an owned checkout session to collect payment" }
  end

  def self.create_payment_intent(**)
    { success: false, error: "Use an owned checkout session to collect payment" }
  end

  def self.refund_payment(order:, amount_cents:, reason: nil, admin_user: nil, test_mode: false,
    request_key: nil, metadata: {}, restoration_request: {})
    Payments::RefundPayment.call(order: order, amount_cents: amount_cents, reason: reason,
      admin_user: admin_user, request_key: request_key, metadata: metadata,
      restoration_request: restoration_request)
  end
end
