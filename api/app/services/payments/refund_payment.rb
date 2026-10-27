# frozen_string_literal: true

module Payments
  class RefundPayment
    def self.call(**args)
      new.call(**args)
    end

    def call(order:, amount_cents:, request_key:, reason: nil, admin_user: nil, metadata: {}, restoration_request: {}, kind: "return")
      unless kind == "return" || (kind == "void" && order.payment_environment == "simulated" && order.simulated?)
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
        operation.update!(state: "dispatching", dispatched_at: Time.current, next_recovery_at: 1.minute.from_now, recovery_deadline_at: 24.hours.from_now)
        true
      end
      if claimed
        dispatch(operation)
      elsif %w[dispatching pending unknown].include?(operation.state)
        reconcile(operation: operation)
      end
      forward_success_effects(operation.reload)
      result(operation.reload)
    rescue ReserveRefund::Rejected => e
      { success: false, refund: nil, error: e.message, status: "rejected", no_operation: true, http_status: e.http_status }
    rescue Conflict => e
      { success: false, refund: nil, error: e.message, status: "conflict", http_status: 409 }
    rescue Error, Configuration::UnsafeConfiguration, ActiveRecord::RecordInvalid => e
      { success: false, refund: nil, error: e.message, status: "reconciliation_required", http_status: 422 }
    end

    # Restart recovery queries the original account and immutable operation key.
    # It never creates a second operation or repeats a network mutation.
    def reconcile(operation:)
      ReserveRefund.validate_authority!(operation)
      if %w[succeeded failed].include?(operation.state)
        forward_success_effects(operation)
        return result(operation)
      end
      return result(operation) if operation.state == "reserved"
      claimed = ReserveRefund.with_locks(operation.order_id) do
        operation = RefundOperation.lock.find(operation.id)
        next false if %w[succeeded failed reserved].include?(operation.state) || operation.next_recovery_at&.future?
        operation.update!(last_queried_at: Time.current, retry_count: operation.retry_count + 1,
          next_recovery_at: operation.recovery_deadline_at&.past? ? 1.hour.from_now : 1.minute.from_now)
        true
      end
      return result(operation) unless claimed
      if operation.provider == "cash"
        apply(operation, { raw_id: nil, status: "succeeded", amount_cents: operation.amount_cents }, "cash:#{operation.id}")
      else
        provider = provider_for(operation)
        observation = provider.query_refund(reference: operation.raw_provider_id,
          operation_key: operation.operation_key, original_reference: operation.original_reference)
        apply(operation, observation, "query:#{Digest::SHA256.hexdigest(observation.to_json)}")
      end
      forward_success_effects(operation.reload)
      result(operation.reload)
    rescue Stripe::StripeError, Timeout::Error, Error, Configuration::UnsafeConfiguration => error
      operation.update!(last_error: error.class.name, next_recovery_at: operation.recovery_deadline_at&.past? ? 1.hour.from_now : 1.minute.from_now)
      result(operation.reload)
    end

    private

    def provider_for(operation)
      # Bound terminal and POS-hosted refunds retain their original collection
      # adapter. Legacy captures without an attempt still use verified identity.
      operation.payment_attempt ? ProviderResolver.for_attempt(operation.payment_attempt) : ProviderResolver.for_identity(operation.payment_identity)
    end

    def forward_success_effects(operation)
      DispatchRefundEffects.call(operation: operation, restore_now: true) if operation.state == "succeeded"
    rescue StandardError => error
      # Financial success is durable even when a local success effect must retry.
      Rails.logger.error("Refund effect operation=#{operation.id} error=#{error.class}")
    end

    def dispatch(operation)
      observation = if operation.provider == "cash"
        { raw_id: nil, status: "succeeded", amount_cents: operation.amount_cents }
      else
        provider_for(operation).refund(attempt: operation.payment_attempt,
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
        identity_id: operation.payment_identity_id, original_reference: operation.original_reference, receipt: observation[:receipt])
    end

    def result(operation)
      { success: operation.state == "succeeded", refund: operation.refund, error: operation.state == "failed" ? "Refund failed" : nil,
        status: operation.state, http_status: %w[succeeded failed].include?(operation.state) ? 200 : 202 }
    end
  end
end
