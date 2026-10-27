# frozen_string_literal: true

module Payments
  class StripeProvider < BaseProvider
    # References are app-owned secret slots, never arbitrary environment variable names.
    def request_options
      raise Configuration::UnsafeConfiguration, "Unknown Stripe credential reference" unless identity.credential_reference == "stripe_default"
      name = identity.environment == "production" ? "STRIPE_SECRET_KEY" : "STRIPE_SECRET_KEY_TEST"
      key = ENV[name]
      prefix = identity.environment == "production" ? "sk_live_" : "sk_test_"
      raise Configuration::UnsafeConfiguration, "Stripe credential does not match payment identity" unless key&.start_with?(prefix)
      { api_key: key, stripe_account: identity.external_account_id }
    end

    def setup(attempt:)
      validate_attempt_identity!(attempt)
      session = attempt.checkout_session
      intent = Stripe::PaymentIntent.create({
        amount: attempt.requested_cents, currency: attempt.currency.downcase,
        receipt_email: attempt.order.customer_email,
        payment_method_types: [session.channel == "pos" ? "card_present" : "card"],
        metadata: { checkout_session_id: session.id, payment_attempt_id: attempt.id,
                    payment_identity_id: identity.id, order_id: attempt.order_id,
                    snapshot_digest: attempt.payload_digest }
      }, request_options.merge(idempotency_key: attempt.operation_key))
      validate_binding!(intent, attempt)
      { raw_id: intent.id, flow: session.channel == "pos" ? "stripe_terminal" : "stripe_embedded", client_secret: intent.client_secret }
    end

    def query(attempt:)
      validate_attempt_identity!(attempt)
      if attempt.raw_provider_id.blank?
        results = Stripe::PaymentIntent.search({ query: "metadata['payment_attempt_id']:'#{attempt.id}'", limit: 2 }, request_options).data
        return Result.new(status: "unknown", identity_id: identity.id, raw_id: nil, requested_cents: attempt.requested_cents,
          approved_cents: 0, captured_cents: 0, currency: attempt.currency, metadata: {}) unless results.one?
        intent = results.first
      else
        intent = Stripe::PaymentIntent.retrieve(attempt.raw_provider_id, request_options)
      end
      validate_binding!(intent, attempt)
      captured = intent.status == "succeeded" ? intent.amount_received : 0
      status = case intent.status
      when "succeeded" then "captured"
      when "canceled" then "cancelled"
      when "requires_payment_method" then "collecting"
      else "collecting"
      end
      Result.new(status: status, identity_id: identity.id, raw_id: intent.id, requested_cents: intent.amount,
        approved_cents: captured, captured_cents: captured, currency: intent.currency.upcase, metadata: {})
    end

    def validate_attempt_identity!(attempt)
      unless attempt.payment_identity_id == identity.id && attempt.checkout_session.payment_identity_id == identity.id && attempt.order_id == attempt.checkout_session.order_id
        raise BindingError, "Adapter identity does not match stored attempt"
      end
    end

    def validate_binding!(intent, attempt)
      validate_attempt_identity!(attempt)
      metadata = intent.metadata.to_h.stringify_keys
      expected = { "checkout_session_id" => attempt.checkout_session_id, "payment_attempt_id" => attempt.id,
        "payment_identity_id" => identity.id, "order_id" => attempt.order_id.to_s, "snapshot_digest" => attempt.payload_digest }
      unless expected.all? { |key, value| metadata[key].to_s == value.to_s } &&
          intent.amount == attempt.requested_cents && intent.currency == attempt.currency.downcase &&
          intent.livemode == (identity.environment == "production") &&
          (attempt.raw_provider_id.nil? || attempt.raw_provider_id == intent.id)
        raise BindingError, "Stripe result does not match the stored attempt"
      end
      true
    end
  end
end
