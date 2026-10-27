# frozen_string_literal: true

module Payments
  class ReconcileAttempt
    def self.call(attempt:)
      stored = AttemptLock.call(attempt) do |session, current, _, order|
        AttemptLock.validate!(session, current, order)
        next nil if %w[compensated failed cancelled].include?(current.state)
        # Reserve the next query slot durably; a worker death is retried by the sweep.
        current.update!(retry_count: current.retry_count + 1, recovery_count: current.recovery_count + 1,
          recovery_deadline_at: current.recovery_deadline_at || 24.hours.from_now, next_recovery_at: 1.minute.from_now)
        current
      end
      return unless stored
      return CompensateAttempt.call(attempt: stored) if stored.compensation_claimed_at
      result = ProviderResolver.for_identity(stored.payment_identity).query(attempt: stored)
      FinalizeOrder.call(attempt: stored, result: result)
    rescue StandardError => error
      if stored
        AttemptLock.call(stored) do |_, current, _, _|
          unless %w[captured compensated].include?(current.state) || current.compensation_claimed_at
            current.update!(state: 'unknown', last_error: error.class.name,
              error_classification: current.recovery_deadline_at&.past? ? 'manual_reconciliation_required' : 'query_retry', next_recovery_at: 1.minute.from_now)
          end
        end
      end
      raise
    end
  end
end
