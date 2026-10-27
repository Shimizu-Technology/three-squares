# frozen_string_literal: true

module Payments
  class ReserveRefund
    # Shared lock order with FinalizeOrder. The operation lock is always last.
    # Bindings are checked again after locking in case a legacy import raced us.
    def self.with_locks(order_id)
      snapshot = Order.find(order_id)
      attempt = PaymentAttempt.find_by(id: snapshot.payment_attempt_id)
      session_id = attempt&.checkout_session_id || snapshot.checkout_session_id
      charge = PaymentTransaction.find_by(payment_attempt_id: attempt.id) if attempt
      ApplicationRecord.transaction do
        CheckoutSession.lock.find(session_id) if session_id
        attempt = PaymentAttempt.lock.find(attempt.id) if attempt
        charge = PaymentTransaction.lock.find(charge.id) if charge
        order = Order.lock.find(order_id)
        unless [ order.checkout_session_id, order.payment_attempt_id, order.payment_identity_id ] ==
            [ snapshot.checkout_session_id, snapshot.payment_attempt_id, snapshot.payment_identity_id ]
          raise Conflict, "Payment binding changed; retry the same refund request"
        end
        yield order, attempt, charge
      end
    end

    def self.validate_authority!(operation)
      if operation.payment_identity
        Configuration.validate_identity!(operation.payment_identity)
      else
        Configuration.validate_environment!
        unless operation.provider == "cash" && Configuration.production? == (operation.environment == "production")
          raise Configuration::UnsafeConfiguration, "Cash environment is not authorized"
        end
      end
    end

    def self.call(**args)
      new.call(**args)
    end

    def call(order:, amount_cents:, request_key:, reason: nil, admin_user: nil, kind: "return", metadata: {}, restoration_request: {})
      raise Error, "amount_cents must be a positive integer" unless amount_cents.is_a?(Integer) && amount_cents.positive?
      raise Error, "Idempotency-Key is required (maximum 255 characters)" unless request_key.is_a?(String) && request_key.strip.present? && request_key.length <= 255
      raise Error, "Refund metadata and restoration request must be objects" unless metadata.is_a?(Hash) && restoration_request.is_a?(Hash)
      raise Error, "Refund reason must be text" unless reason.nil? || reason.is_a?(String)
      raise Error, "Unknown refund operation kind" unless %w[return void reversal].include?(kind)
      payload = { amount_cents: amount_cents, kind: kind, reason: reason, metadata: metadata, restoration_request: restoration_request }.deep_stringify_keys
      digest = Digest::SHA256.hexdigest(canonical_json(payload))
      # Existing requests never query or dispatch the provider again.
      existing = RefundOperation.find_by(order_id: order.id, caller_idempotency_key: request_key)
      return check_payload!(existing, digest) if existing

      legacy = legacy_capture(order.reload)
      self.class.with_locks(order.id) do |locked, attempt, charge|
        existing = RefundOperation.find_by(order_id: locked.id, caller_idempotency_key: request_key)
        next check_payload!(existing, digest) if existing
        raise Error, "Order is not paid" unless locked.payment_status == "paid"
        facts = capture_facts!(locked, attempt, charge, legacy)
        used = RefundOperation.where(order_id: locked.id).holding.sum(:amount_cents)
        # Historical refunds retain their financial effect when the new ledger starts.
        used += Refund.where(order_id: locked.id, refund_operation_id: nil, status: %w[pending unknown succeeded]).sum(:amount_cents)
        raise Conflict, "Refund exceeds captured amount less succeeded and reserved refunds" if amount_cents > facts[:captured_cents] - used
        operation = RefundOperation.create!(**facts, order: locked, amount_cents: amount_cents,
          caller_idempotency_key: request_key, payload_digest: digest, kind: kind, reason: reason,
          user: admin_user, metadata: metadata, restoration_request: restoration_request)
        Refund.create!(order: locked, refund_operation: operation, amount_cents: amount_cents,
          reason: reason, user: admin_user, status: "pending", metadata: metadata)
        operation
      end
    end

    private

    def canonical_json(value)
      case value
      when Hash then "{#{value.sort.map { |k, v| "#{k.to_json}:#{canonical_json(v)}" }.join(',')}}"
      when Array then "[#{value.map { |v| canonical_json(v) }.join(',')}]"
      else value.to_json
      end
    end

    def check_payload!(operation, digest)
      raise Conflict, "Idempotency-Key was already used with a different payload" unless operation.payload_digest == digest
      operation
    end

    def legacy_capture(order)
      return nil if order.payment_method == "cash" || order.payment_attempt_id.present?
      identity = PaymentIdentity.find_by(id: order.payment_identity_id)
      raise BindingError, "Original payment identity is unverified; reconciliation required" unless identity
      raise BindingError, "Legacy payment requires verified Stripe mapping" unless identity.provider == "stripe"
      reference = order.payment_reference.presence || order.payment_intent_id
      raise BindingError, "Original charge is missing; reconciliation required" if reference.blank?
      result = ProviderResolver.for_identity(identity).query_original_charge(reference: reference)
      unless result[:identity_id] == identity.id && result[:status] == "captured" && result[:raw_id] == reference &&
          result[:currency] == identity.currency && result[:amount_cents].is_a?(Integer) && result[:amount_cents] == order.total_cents
        raise BindingError, "Original charge query did not verify order capture; reconciliation required"
      end
      { payment_identity_id: identity.id, original_reference: reference, captured_cents: result[:amount_cents],
        provider: identity.provider, environment: identity.environment, currency: identity.currency }
    rescue Stripe::StripeError, Timeout::Error
      raise BindingError, "Original charge could not be verified; reconciliation required"
    end

    def capture_facts!(order, attempt, charge, legacy)
      if order.payment_method == "cash"
        raise BindingError, "Cash order has processor evidence; reconciliation required" if order.payment_identity_id || order.payment_attempt_id || order.payment_intent_id.present? || order.payment_reference.present?
        # No current setting supplies the original environment, even for cash.
        environment = order.payment_environment
        raise BindingError, "Cash environment is unverified; reconciliation required" unless %w[simulated sandbox production].include?(environment)
        raise Configuration::UnsafeConfiguration, "Cash environment is not authorized" if Configuration.production? != (environment == "production")
        return { provider: "cash", environment: environment, currency: "USD", original_reference: "cash:#{order.id}", captured_cents: order.total_cents }
      end
      identity = PaymentIdentity.find_by(id: order.payment_identity_id)
      raise BindingError, "Original payment identity is unverified; reconciliation required" unless identity
      Configuration.validate_identity!(identity)
      if attempt
        unless charge && charge.order_id == order.id && charge.payment_attempt_id == attempt.id &&
            attempt.order_id == order.id && attempt.checkout_session_id == order.checkout_session_id &&
            attempt.payment_identity_id == identity.id && charge.payment_identity_id == identity.id &&
            charge.provider == identity.provider && charge.currency == identity.currency &&
            charge.raw_provider_id == attempt.raw_provider_id && attempt.state == "captured" &&
            (order.payment_environment.nil? || order.payment_environment == identity.environment) &&
            charge.state == "captured" && attempt.captured_cents == charge.amount_cents &&
            charge.amount_cents == order.total_cents && attempt.compensation_claimed_at.nil?
          raise BindingError, "Original captured charge binding is invalid or compensation is active"
        end
        { payment_identity_id: identity.id, payment_attempt_id: attempt.id, original_charge_id: charge.id,
          original_reference: charge.raw_provider_id, provider: identity.provider, environment: identity.environment,
          currency: charge.currency, captured_cents: charge.amount_cents }
      else
        unless legacy && legacy[:payment_identity_id] == identity.id &&
            legacy[:original_reference] == (order.payment_reference.presence || order.payment_intent_id) && legacy[:captured_cents] == order.total_cents
          raise BindingError, "Legacy capture changed; reconciliation required"
        end
        legacy
      end
    end
  end
end
