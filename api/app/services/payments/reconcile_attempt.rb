# frozen_string_literal: true

module Payments
  class ReconcileAttempt
    def self.call(attempt:, force: false)
      stored = AttemptLock.call(attempt) do |session, current, _, order|
        AttemptLock.validate!(session, current, order)
        next nil if %w[compensated failed cancelled].include?(current.state)
        next nil if !force && current.last_queried_at && current.last_queried_at > 2.seconds.ago
        # Reserve the next query slot durably; a worker death is retried by the sweep.
        current.update!(last_queried_at: Time.current, retry_count: current.retry_count + 1, recovery_count: current.recovery_count + 1,
          recovery_deadline_at: current.recovery_deadline_at || 24.hours.from_now, next_recovery_at: 1.minute.from_now)
        current
      end
      return unless stored
      return CompensateAttempt.call(attempt: stored) if stored.compensation_claimed_at
      if stored.raw_provider_id.blank? && stored.dispatched_at.nil?
        if stored.checkout_session.expires_at.past?
          AttemptLock.call(stored) do |session, current, _, _|
            if current.dispatched_at.nil? && current.raw_provider_id.blank?
              current.update!(state: 'cancelled', next_recovery_at: nil)
              session.update!(state: 'cancelled')
              InventoryReservation.where(order_id: current.order_id, state: 'held').update_all(state: 'released', updated_at: Time.current)
            end
          end
          return stored.order
        end
        SetupAttempt.call(attempt: stored)
      end
      provider = ProviderResolver.for_identity(stored.payment_identity)
      result = provider.query(attempt: stored)
      if result.status == 'unknown' && result.raw_id.blank? && stored.raw_provider_id.blank? &&
          stored.dispatched_at && stored.dispatched_at > 23.hours.ago && stored.retry_count <= 5
        # Replay only the original immutable operation inside its safe window.
        stored.update!(next_recovery_at: Time.current)
        SetupAttempt.call(attempt: stored)
        result = provider.query(attempt: stored.reload) if stored.raw_provider_id.present?
      end
      # Expiry forbids further collection, but only authenticated provider proof
      # permits cancellation; an unknown outcome retains its financial claim.
      if stored.checkout_session.expires_at.past? && result.captured_cents.zero? && result.metadata[:cancellable] && result.raw_id.present?
        stored.update!(raw_provider_id: result.raw_id) if stored.raw_provider_id.blank?
        result = provider.cancel(attempt: stored)
      end
      order = FinalizeOrder.call(attempt: stored, result: result)
      if stored.reload.recovery_deadline_at&.past? && !%w[captured compensated failed cancelled].include?(stored.state)
        stored.update!(error_classification: 'manual_reconciliation_required', next_recovery_at: 1.hour.from_now)
      end
      # Fast, local after-commit consumption keeps the browser cart current;
      # the durable sweeper owns retries if the request disappears here.
      if order.payment_status == 'paid'
        effect = PaymentOutbox.find_by(effect_key: "order:#{order.id}:cart_cleanup")
        DispatchOutbox.call(outbox: effect) if effect
      end
      order
    rescue StandardError => error
      if stored
        AttemptLock.call(stored) do |_, current, _, _|
          unless %w[captured compensated].include?(current.state) || current.compensation_claimed_at
            current.update!(state: 'unknown', last_error: error.class.name,
              error_classification: current.recovery_deadline_at&.past? ? 'manual_reconciliation_required' : 'query_retry', next_recovery_at: current.recovery_deadline_at&.past? ? 1.hour.from_now : 1.minute.from_now)
          end
        end
      end
      raise
    end
  end
end
