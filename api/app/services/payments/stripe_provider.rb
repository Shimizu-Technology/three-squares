# frozen_string_literal: true

module Payments
  class StripeProvider < BaseProvider
    def create_checkout_session(amount_cents:, customer_email:, order_id:)
      Rails.logger.info "💳 Creating Stripe checkout session payload: $#{'%.2f' % (amount_cents / 100.0)}"

      intent = Stripe::PaymentIntent.create(
        amount: amount_cents,
        currency: "usd",
        receipt_email: customer_email,
        metadata: {
          order_id: order_id
        }
      )

      {
        success: true,
        provider: "stripe",
        flow: "embedded",
        client_secret: intent.client_secret,
        payment_reference: intent.id,
        payment_intent_id: intent.id
      }
    end

    def process_payment(amount_cents:, payment_method:, order:, customer_email:)
      Rails.logger.info "💳 Processing Stripe payment: $#{'%.2f' % (amount_cents / 100.0)}"

      charge = Stripe::Charge.create(
        amount: amount_cents,
        currency: "usd",
        source: payment_method[:token],
        description: "Order ##{order.id} - Three Squares",
        receipt_email: customer_email,
        metadata: {
          order_id: order.id,
          order_type: order.order_type
        }
      )

      {
        success: true,
        provider: "stripe",
        charge_id: charge.id,
        payment_reference: charge.id,
        payment_method: "stripe",
        card_last4: charge.source&.last4,
        card_brand: charge.source&.brand
      }
    end

    def refund_payment(order:, amount_cents:, reason:, admin_user:)
      Rails.logger.info "💸 Processing Stripe refund: $#{"%.2f" % (amount_cents / 100.0)} for Order ##{order.order_number}"
      payment_reference = order.effective_payment_reference

      refund_params = {
        payment_intent: payment_reference,
        amount: amount_cents,
        reason: map_refund_reason(reason)
      }

      stripe_refund = Stripe::Refund.create(refund_params)

      refund = order.refunds.create!(
        stripe_refund_id: stripe_refund.id,
        provider_refund_id: stripe_refund.id,
        payment_provider: "stripe",
        amount_cents: amount_cents,
        reason: reason,
        status: stripe_refund.status == "succeeded" ? "succeeded" : "pending",
        user: admin_user,
        metadata: { stripe_status: stripe_refund.status, payment_provider: "stripe" }
      )

      order.update!(payment_status: "refunded") if order.fully_refunded?

      { success: true, refund: refund, stripe_refund_id: stripe_refund.id, provider_refund_id: stripe_refund.id }
    end

    def verify_payment(payment_reference:, expected_amount_cents:)
      intent = Stripe::PaymentIntent.retrieve(payment_reference)

      unless intent.status == "succeeded"
        return { success: false, provider: "stripe", captured: false, error: "Payment has not been completed (status: #{intent.status})" }
      end

      if (intent.amount - expected_amount_cents).abs > 1
        Rails.logger.warn "Payment amount mismatch: expected #{expected_amount_cents}, got #{intent.amount}"
        return { success: false, provider: "stripe", captured: true, error: "Payment amount does not match order total" }
      end

      { success: true, provider: "stripe", captured: true, payment_reference: intent.id }
    rescue Stripe::InvalidRequestError => e
      Rails.logger.error "Invalid PaymentIntent ID: #{e.message}"
      { success: false, provider: "stripe", captured: false, error: "Invalid payment reference" }
    rescue Stripe::StripeError => e
      Rails.logger.error "Stripe verification error: #{e.message}"
      { success: false, provider: "stripe", captured: :unknown, error: "Payment verification failed. Please try again." }
    end

    private

    def map_refund_reason(reason)
      case reason&.downcase
      when "duplicate" then "duplicate"
      when "fraudulent" then "fraudulent"
      else "requested_by_customer"
      end
    end
  end
end
