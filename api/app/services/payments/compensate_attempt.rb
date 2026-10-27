# frozen_string_literal: true

module Payments
  class CompensateAttempt
    LEASE = 5.minutes

    def self.claim!(attempt:)
      AttemptLock.call(attempt) { |session, stored, charge, order| claim_locked!(session, stored, charge, order) }
    end

    def self.validate!(session, attempt, charge, order)
      identity = AttemptLock.validate!(session, attempt, order)
      unless charge && charge.payment_attempt_id == attempt.id && charge.payment_identity_id == identity.id &&
          charge.raw_provider_id == attempt.raw_provider_id && charge.reference == identity.canonical_reference(attempt.raw_provider_id) &&
          charge.currency == attempt.currency && charge.amount_cents <= attempt.requested_cents &&
          charge.order_id.nil? && !InventoryCommitment.exists?(order_id: order.id) && order.inventory_committed_at.nil?
        raise BindingError, 'Compensation requires an owned, unconsumed charge'
      end
    end

    def self.claim_locked!(session, attempt, charge, order)
      validate!(session, attempt, charge, order)
      return attempt if attempt.state == 'compensated'
      unless %w[compensation_required compensating reconciliation_required].include?(attempt.state)
        raise BindingError, 'No compensation intent'
      end
      attempt.update!(compensation_claimed_at: attempt.compensation_claimed_at || Time.current,
        compensation_operation_key: attempt.compensation_operation_key || SecureRandom.uuid,
        next_recovery_at: Time.current)
      PaymentOutbox.record!(effect_key: "attempt:#{attempt.id}:compensate", kind: 'compensate', payload: { 'attempt_id' => attempt.id })
      attempt
    end

    def self.call(attempt:)
      dispatch = AttemptLock.call(attempt) do |session, stored, charge, order|
        validate!(session, stored, charge, order)
        next nil if stored.state == 'compensated'
        raise BindingError, 'Missing active compensation claim' unless stored.compensation_claimed_at && stored.compensation_operation_key
        next nil if stored.compensation_lease_until&.future?
        next nil if stored.error_classification == 'manual_reconciliation_required'
        if stored.compensation_provider_id.nil? && stored.compensation_dispatched_at && stored.compensation_dispatched_at < 23.hours.ago
          stored.update!(state: 'reconciliation_required', error_classification: 'manual_reconciliation_required',
            last_error: 'reversal_idempotency_window_elapsed', next_recovery_at: 1.hour.from_now)
          next nil
        end
        previously_dispatched = stored.compensation_dispatched_at.present?
        stored.update!(compensation_dispatched_at: stored.compensation_dispatched_at || Time.current, state: 'compensating', compensation_lease_until: LEASE.from_now,
          retry_count: stored.retry_count + 1, next_recovery_at: LEASE.from_now)
        [stored, stored.compensation_operation_key, previously_dispatched]
      end
      return unless dispatch
      stored, key, previously_dispatched = dispatch
      # Financial network calls are deliberately outside all database locks.
      provider = ProviderResolver.for_attempt(stored)
      result = if stored.compensation_provider_id.present? || (previously_dispatched && provider.respond_to?(:replay_reversal?) && !provider.replay_reversal?)
        provider.query_reversal(attempt: stored, operation_key: key)
      else
        provider.reverse(attempt: stored, operation_key: key)
      end
      AttemptLock.call(stored) do |session, current, charge, order|
        validate!(session, current, charge, order)
        next if current.state == 'compensated' || current.error_classification == 'manual_reconciliation_required'
        unless result.is_a?(Hash) && %w[succeeded pending failed unknown].include?(result[:status]) &&
            result[:amount_cents] == (current.captured_cents.positive? ? current.captured_cents : current.approved_cents) &&
            (current.compensation_provider_id.nil? || current.compensation_provider_id == result[:raw_id]) &&
            (result[:status] == 'unknown' || result[:raw_id].present?)
          raise BindingError, 'Reversal result binding mismatch'
        end
        current.update!(compensation_provider_id: current.compensation_provider_id || result[:raw_id], compensation_status: result[:status])
        if result[:status] == 'succeeded'
          current.update!(state: 'compensated', compensation_lease_until: nil, next_recovery_at: nil, last_error: nil)
          charge.update!(state: 'compensated')
          session.update!(state: 'compensated')
          InventoryReservation.where(order_id: order.id, state: 'held').update_all(state: 'released', updated_at: Time.current)
        else
          current.update!(state: 'reconciliation_required', compensation_lease_until: nil,
            next_recovery_at: 1.minute.from_now, last_error: "reversal_outcome_#{result[:status]}")
        end
      end
    rescue StandardError => error
      if dispatch
        AttemptLock.call(attempt) do |_, current, _, _|
          unless current.state == 'compensated'
            current.update!(state: 'reconciliation_required', compensation_lease_until: nil,
              next_recovery_at: 1.minute.from_now, last_error: error.class.name)
          end
        end
      end
      raise
    end
  end
end
