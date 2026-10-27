# frozen_string_literal: true

module Payments
  class RefundPayment
    def self.call(**args)
      new.call(**args)
    end

    def call(order:, amount_cents:, request_key:, reason: nil, admin_user: nil, metadata: {}, restoration_request: {}, kind: "return")
      unless kind == "return"
        existing = RefundOperation.find_by(order_id: order.id, caller_idempotency_key: request_key)
        raise Conflict, "Idempotency-Key was already used with a different payload" if existing && existing.kind != kind
        raise UnsupportedCapability, "Only linked returns are enabled for admin refunds"
      end
      operation = ReserveRefund.call(order: order, amount_cents: amount_cents, request_key: request_key,
        reason: reason, admin_user: admin_user, metadata: metadata, restoration_request: restoration_request, kind: kind)
      claimed = ReserveRefund.with_locks(order.id) do |_locked, _attempt, _charge|
        operation = RefundOperation.lock.find(operation.id)
        next false unless operation.state == "reserved"
        ReserveRefund.validate_authority!(operation)
        operation.update!(state: "dispatching", dispatched_at: Time.current)
        true
      end
      dispatch(operation) if claimed
      result(operation.reload)
    rescue Conflict => e
      { success: false, refund: nil, error: e.message, status: "conflict", http_status: 409 }
    rescue Error, Configuration::UnsafeConfiguration, ActiveRecord::RecordInvalid => e
      { success: false, refund: nil, error: e.message, status: "reconciliation_required", http_status: 422 }
    end

    # Restart recovery queries the original account and immutable operation key.
    # It never creates a second operation or repeats a network mutation.
    def reconcile(operation:)
      ReserveRefund.validate_authority!(operation)
      return result(operation) if %w[succeeded failed].include?(operation.state)
      return result(operation) if operation.state == "reserved"
      if operation.provider == "cash"
        apply(operation, { raw_id: nil, status: "succeeded", amount_cents: operation.amount_cents }, "cash:#{operation.id}")
      else
        provider = ProviderResolver.for_identity(operation.payment_identity)
        observation = provider.query_refund(reference: operation.raw_provider_id,
          operation_key: operation.operation_key)
        apply(operation, observation, "query:#{Digest::SHA256.hexdigest(observation.to_json)}")
      end
      result(operation.reload)
    end

    private

    def dispatch(operation)
      observation = if operation.provider == "cash"
        { raw_id: nil, status: "succeeded", amount_cents: operation.amount_cents }
      else
        ProviderResolver.for_identity(operation.payment_identity).refund(attempt: operation.payment_attempt,
          reference: operation.original_reference, amount_cents: operation.amount_cents,
          operation_key: operation.operation_key,
          metadata: { refund_operation_id: operation.id, operation_key: operation.operation_key, order_id: operation.order_id,
            reference_number: operation.reference_number.to_s, operation_kind: operation.kind })
      end
      apply(operation, observation, "dispatch:#{operation.id}")
    rescue StandardError => e
      # Once dispatch was claimed, even a process/config/transport failure may
      # follow a successful remote mutation. Hold all cents until a bound query.
      Rails.logger.warn("Refund #{operation.id} outcome unknown: #{e.class}")
      apply(operation, { raw_id: nil, status: "unknown", amount_cents: operation.amount_cents }, "dispatch-unknown:#{operation.id}")
    end

    def apply(operation, observation, event_key)
      # A not-found query has no external amount fact. It only preserves our
      # existing reservation; it can never approve or release money.
      amount = observation[:status] == "unknown" && observation[:raw_id].blank? ? operation.amount_cents : observation.fetch(:amount_cents)
      ApplyPaymentEvent.call(operation: operation, event_key: event_key,
        status: observation.fetch(:status), raw_id: observation[:raw_id], amount_cents: amount,
        identity_id: operation.payment_identity_id, original_reference: operation.original_reference)
    end

    def result(operation)
      { success: operation.state == "succeeded", refund: operation.refund, error: operation.state == "failed" ? "Refund failed" : nil,
        status: operation.state, http_status: %w[succeeded failed].include?(operation.state) ? 200 : 202 }
    end
  end
end
