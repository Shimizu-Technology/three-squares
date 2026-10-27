# frozen_string_literal: true

module Payments
  class StripeProvider < BaseProvider
    # References are app-owned secret slots, never arbitrary environment variable names.
    def request_options
      raise Configuration::UnsafeConfiguration, "Unknown Stripe credential reference" unless identity.credential_reference == "stripe_default"
      name = identity.environment == "production" ? "STRIPE_SECRET_KEY" : "STRIPE_SECRET_KEY_TEST"
      key = ENV[name]
      prefixes = identity.environment == "production" ? %w[sk_live_ rk_live_] : %w[sk_test_ rk_test_]
      raise Configuration::UnsafeConfiguration, "Stripe credential does not match payment identity" unless key&.start_with?(*prefixes)
      { api_key: key, stripe_account: identity.external_account_id }
    end

    def client
      @client ||= Stripe::StripeClient.new(request_options.fetch(:api_key), stripe_account: identity.external_account_id)
    end

    def setup(attempt:)
      validate_attempt_identity!(attempt)
      session = attempt.checkout_session
      params = {
        amount: attempt.requested_cents, currency: attempt.currency.downcase,
        receipt_email: attempt.order.customer_email,
        metadata: { checkout_session_id: session.id, payment_attempt_id: attempt.id,
                    payment_identity_id: identity.id, order_id: attempt.order_id,
                    snapshot_digest: attempt.payload_digest }
      }
      if session.channel == "pos"
        params[:payment_method_types] = ["card_present"]
      else
        params[:automatic_payment_methods] = { enabled: true, allow_redirects: "never" }
      end
      intent = client.v1.payment_intents.create(params, { idempotency_key: attempt.operation_key })
      validate_binding!(intent, attempt)
      { raw_id: intent.id, flow: session.channel == "pos" ? "stripe_terminal" : "stripe_embedded", client_secret: intent.client_secret }
    end

    def query(attempt:)
      validate_attempt_identity!(attempt)
      if attempt.raw_provider_id.blank?
        results = client.v1.payment_intents.search({ query: "metadata['payment_attempt_id']:'#{attempt.id}'", limit: 2 }).data
        return Result.new(status: "unknown", identity_id: identity.id, raw_id: nil, requested_cents: attempt.requested_cents,
          approved_cents: 0, captured_cents: 0, currency: attempt.currency, metadata: {}) unless results.one?
        intent = results.first
      else
        intent = client.v1.payment_intents.retrieve(attempt.raw_provider_id)
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
        approved_cents: captured, captured_cents: captured, currency: intent.currency.upcase, metadata: { cancellable: %w[requires_payment_method requires_confirmation requires_action requires_capture].include?(intent.status) })
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

    def collection(attempt:)
      validate_attempt_identity!(attempt)
      intent = client.v1.payment_intents.retrieve(attempt.raw_provider_id)
      validate_binding!(intent, attempt)
      { raw_id: intent.id, flow: attempt.checkout_session.channel == "pos" ? "stripe_terminal" : "stripe_embedded", client_secret: intent.client_secret }
    end

    def cancel(attempt:)
      validate_attempt_identity!(attempt)
      intent = client.v1.payment_intents.retrieve(attempt.raw_provider_id)
      validate_binding!(intent, attempt)
      return query(attempt: attempt) if intent.status == "succeeded"
      client.v1.payment_intents.cancel(intent.id, {}, { idempotency_key: "cancel:#{attempt.operation_key}" }) unless intent.status == "canceled"
      query(attempt: attempt)
    end

    def reverse(attempt:, operation_key:)
      validate_attempt_identity!(attempt)
      intent = client.v1.payment_intents.retrieve(attempt.raw_provider_id)
      validate_binding!(intent, attempt)
      refund(attempt: attempt, reference: attempt.raw_provider_id, amount_cents: attempt.captured_cents.positive? ? attempt.captured_cents : attempt.approved_cents,
        operation_key: operation_key, metadata: { payment_attempt_id: attempt.id, compensation: "true" })
    end

    def query_reversal(attempt:, operation_key:)
      validate_attempt_identity!(attempt)
      result = query_refund(reference: attempt.compensation_provider_id, operation_key: operation_key, original_reference: attempt.raw_provider_id)
      result[:amount_cents] = [attempt.captured_cents, attempt.approved_cents].max if result[:status] == "unknown" && result[:raw_id].nil?
      result
    end

    def refund(attempt:, reference:, amount_cents:, operation_key:, metadata:)
      if attempt
        validate_attempt_identity!(attempt)
        raise BindingError, "Refund reference changed" unless reference == attempt.raw_provider_id
      end
      key = reference_key(reference)
      params = { key => reference, amount: amount_cents, metadata: metadata.merge(operation_key: operation_key) }
      response = client.v1.refunds.create(params, { idempotency_key: operation_key })
      normalize_refund(response, operation_key: operation_key, original_reference: reference)
    end

    def query_refund(reference:, operation_key:, original_reference: nil)
      response = if reference.present?
        client.v1.refunds.retrieve(reference)
      else
        # Stripe has no refund search API. Paginate authenticated results, matching
        # the immutable operation metadata. Absence is unknown, never failure.
        matches = []
        params = { limit: 100 }
        params[reference_key(original_reference)] = original_reference if original_reference
        20.times do
          page = client.v1.refunds.list(params)
          matches.concat(page.data.select { |row| row.metadata.to_h.stringify_keys["operation_key"] == operation_key })
          break unless page.has_more && page.data.any?
          params[:starting_after] = page.data.last.id
        end
        raise BindingError, "Multiple refunds matched one operation" if matches.size > 1
        matches.first
      end
      return { raw_id: nil, status: "unknown", amount_cents: 0 } unless response
      normalize_refund(response, operation_key: operation_key, original_reference: original_reference)
    end

    def query_original_charge(reference:)
      object = reference_key(reference) == :payment_intent ? client.v1.payment_intents.retrieve(reference) : client.v1.charges.retrieve(reference)
      live = object.livemode == (identity.environment == "production")
      captured = reference.start_with?("pi_") ? object.status == "succeeded" && object.amount_received.positive? : object.paid && object.captured
      raise BindingError, "Original charge is not captured in this identity" unless live && captured && object.currency == "usd" && object.id == reference
      linked_intent = object.respond_to?(:payment_intent) ? object.payment_intent : nil
      linked_intent = linked_intent.id if linked_intent.respond_to?(:id)
      { identity_id: identity.id, raw_id: object.id, status: "captured", amount_cents: reference.start_with?("pi_") ? object.amount_received : object.amount_captured,
        currency: "USD", consumption_reference: reference.start_with?('pi_') ? object.id : linked_intent.presence || object.id,
        order_id: object.respond_to?(:metadata) ? object.metadata.to_h.stringify_keys['order_id'] : nil }
    end

    def reference_key(reference)
      return :payment_intent if reference.to_s.match?(/\Api_[A-Za-z0-9]+\z/)
      return :charge if reference.to_s.match?(/\Ach_[A-Za-z0-9]+\z/)
      raise BindingError, "Invalid Stripe financial reference"
    end

    def normalize_refund(response, operation_key:, original_reference: nil)
      fields = response.to_h.deep_stringify_keys
      raise BindingError, "Refund operation mismatch" unless fields.fetch("metadata", {})["operation_key"] == operation_key && fields["currency"] == "usd"
      if original_reference
        raise BindingError, "Refund original charge mismatch" unless fields[reference_key(original_reference).to_s] == original_reference
      end
      status = case fields["status"]
      when "succeeded", "failed" then fields["status"]
      when "canceled" then "failed"
      else "pending"
      end
      { raw_id: fields.fetch("id"), status: status, amount_cents: fields.fetch("amount") }
    end
  end
end
