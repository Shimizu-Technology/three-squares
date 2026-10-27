# frozen_string_literal: true

module Payments
  class TestProvider < BaseProvider
    def create_checkout_session(amount_cents:, customer_email:, order_id:)
      Rails.logger.info "⚙️  TEST MODE: Creating simulated checkout session"
      Rails.logger.info "   Amount: $#{'%.2f' % (amount_cents / 100.0)}"
      Rails.logger.info "   Customer: #{customer_email}"
      Rails.logger.info "   Order ID: #{order_id}"

      payment_reference = "test_pi_#{SecureRandom.hex(12)}"

      {
        success: true,
        provider: "test",
        flow: "simulated",
        client_secret: "test_secret_#{SecureRandom.hex(16)}",
        payment_reference: payment_reference,
        payment_intent_id: payment_reference
      }
    end

    def process_payment(amount_cents:, payment_method:, order:, customer_email:)
      Rails.logger.info "⚙️  TEST MODE: Simulating payment of $#{'%.2f' % (amount_cents / 100.0)}"
      Rails.logger.info "   Order ID: #{order.id}"
      Rails.logger.info "   Customer: #{customer_email}"
      Rails.logger.info "   Payment Method: #{payment_method.inspect}"

      sleep(0.5)
      charge_id = "test_charge_#{SecureRandom.hex(12)}"

      {
        success: true,
        provider: "test",
        charge_id: charge_id,
        payment_reference: charge_id,
        payment_method: "test",
        card_last4: "4242",
        card_brand: "Visa (Test)"
      }
    end

    def refund_payment(order:, amount_cents:, reason:, admin_user:)
      Rails.logger.info "⚙️  TEST MODE: Simulating refund of $#{"%.2f" % (amount_cents / 100.0)} for Order ##{order.order_number}"

      sleep(0.3)
      fake_refund_id = "test_refund_#{SecureRandom.hex(12)}"

      refund = order.refunds.create!(
        stripe_refund_id: fake_refund_id,
        provider_refund_id: fake_refund_id,
        payment_provider: "test",
        amount_cents: amount_cents,
        reason: reason,
        status: "succeeded",
        user: admin_user,
        metadata: { test_mode: true, payment_provider: "test" }
      )

      order.update!(payment_status: "refunded") if order.fully_refunded?

      { success: true, refund: refund, stripe_refund_id: fake_refund_id, provider_refund_id: fake_refund_id }
    end

    def verify_payment(payment_reference:, expected_amount_cents:)
      return { success: false, provider: "test", captured: false, error: "Invalid test payment reference" } unless payment_reference.to_s.start_with?("test_pi_")

      { success: true, provider: "test", captured: true, payment_reference: payment_reference, expected_amount_cents: expected_amount_cents }
    end
  end
end
