module Payments
  module Simulation
    # A local deterministic scheduler, not an Express webhook endpoint. Only
    # fixture ledger observations may enter the same finalizer used by queries.
    class Events
      def self.deliver_due(identity)
        Guard.validate!(identity)
        now = SimulationClock.for(identity).now
        SimulatedPaymentRecord.where(payment_identity: identity, kind: 'collection', scenario: %w[cancel_race late_event duplicate_event]).find_each do |row|
          next if row.facts['event_delivered'] || !row.facts['event_at'] || Time.iso8601(row.facts['event_at']) > now
          attempt = row.payment_attempt
          provider = ProviderResolver.for_identity(identity)
          result = provider.query(attempt: attempt)
          (row.scenario == 'duplicate_event' ? 2 : 1).times { FinalizeOrder.call(attempt: attempt, result: result) }
          CompensateAttempt.call(attempt: attempt.reload) if attempt.reload.compensation_claimed_at
          row.with_lock { row.update!(facts: row.facts.merge('event_delivered' => true)) }
        end
      end
    end
  end
end
