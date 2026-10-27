module Payments
  module Simulation
    class ScenarioEngine
      SCENARIOS = %w[approve decline expired partial duplicate idempotent_replay key_mismatch timeout_before_dispatch timeout_after_approval network_error host_error avs_fail cvv_fail cancel_before_card cancel_race query_lag malformed_response refund_timeout refund_decline terminal_offline busy invalid_pin late_event duplicate_event].freeze
      NULL_AMOUNTS = {100 => 'approve', 2305 => 'partial', 20 => 'decline', 21 => 'expired', 22 => 'duplicate', 23 => 'duplicate', 1001 => 'network_error', 1002 => 'host_error'}.freeze

      def initialize(identity)
        @identity = Guard.validate!(identity)
      end

      def validate_attempt!(attempt)
        Guard.validate!(@identity)
        unless attempt.payment_identity_id == @identity.id && attempt.checkout_session.payment_identity_id == @identity.id &&
            attempt.order.payment_identity_id == @identity.id && attempt.order.simulated? && attempt.order.payment_environment == 'simulated'
          raise BindingError, 'Simulation attempt binding mismatch'
        end
      end

      def setup(attempt)
        validate_attempt!(attempt)
        digest = Snapshot.digest(attempt_id: attempt.id, amount: attempt.requested_cents, snapshot: attempt.payload_digest)
        record = SimulatedPaymentRecord.create_or_find_by!(payment_identity: @identity, operation_key: attempt.operation_key) do |row|
          row.assign_attributes(payment_attempt: attempt, kind: 'collection', payload_digest: digest,
            raw_id: "sim_#{SecureRandom.hex(16)}", amount_cents: attempt.requested_cents, expires_at: SimulationClock.for(@identity).now + 10.minutes)
        end
        raise Conflict, 'Simulation operation payload changed' unless record.payload_digest == digest && record.payment_attempt_id == attempt.id
        record
      end

      def collect(attempt:, scenario:, handle:, mode: 'token')
        validate_attempt!(attempt)
        scenario = NULL_AMOUNTS.fetch(attempt.requested_cents, 'approve') if scenario == 'null_amounts'
        raise Error, 'Unknown simulation scenario' unless SCENARIOS.include?(scenario)
        raise Error, 'Unknown bridge mode' unless %w[token hosted].include?(mode)
        record = setup(attempt)
        record.with_lock do
          raise BindingError, 'Invalid simulated collection handle' unless record.handle_digest.present? && ActiveSupport::SecurityUtils.secure_compare(record.handle_digest, CheckoutSession.digest(handle))
          if record.redeemed_at
            raise Conflict, 'Handle already used with different details' unless record.scenario == scenario && record.facts['bridge_mode'] == mode
            return record
          end
          raise Conflict, 'Simulated collection expired' if record.expires_at <= SimulationClock.for(@identity).now || attempt.checkout_session.expires_at.past?
          raise Conflict, 'Collection is closed' unless %w[collecting dispatching unknown].include?(attempt.reload.state) && !attempt.compensation_claimed_at
          raise Conflict, 'Operation key/type mismatch (108)' if scenario == 'key_mismatch'
          # Pre-dispatch failure leaves a reusable original handle; no money moved.
          raise Error, 'Simulated connection failed before dispatch; retry the saved payment' if scenario == 'timeout_before_dispatch'
          state = case scenario
          when 'decline', 'expired', 'terminal_offline', 'busy', 'invalid_pin' then 'failed'
          when 'cancel_before_card' then 'cancelled'
          when 'network_error' then 'unknown'
          when 'partial' then 'partial'
          else 'captured'
          end
          facts = record.facts.merge('bridge_mode' => mode, 'approved_cents' => state == 'partial' ? [record.amount_cents / 2, 1].max : (state == 'captured' ? record.amount_cents : 0),
            'dispatched_at' => SimulationClock.for(@identity).now.iso8601, 'query_count' => 0)
          facts['visible_after'] = (SimulationClock.for(@identity).now + 60.seconds).iso8601 if scenario == 'query_lag'
          record.update!(scenario: scenario, state: state, redeemed_at: Time.current, facts: facts)
        end
        record
      end

      def handle_for(record)
        Guard.validate!(@identity)
        record.with_lock do
          # Stable opaque handle can be recovered after reload; authority is the
          # authenticated session and this ledger binding, never the sim_ prefix.
          handle = record.facts['handle'] || "sim_#{SecureRandom.hex(32)}"
          record.update!(handle_digest: CheckoutSession.digest(handle), facts: record.facts.merge('handle' => handle)) unless record.handle_digest
          handle
        end
      end

      def query(attempt)
        validate_attempt!(attempt)
        record = SimulatedPaymentRecord.find_by!(payment_identity: @identity, payment_attempt: attempt, kind: 'collection')
        record.with_lock { record.update!(facts: record.facts.merge('query_count' => record.facts.fetch('query_count', 0) + 1)) }
        record
      end

      def reverse(attempt:, operation_key:)
        validate_attempt!(attempt)
        original = setup(attempt)
        mutate(original: original, amount_cents: [attempt.captured_cents, attempt.approved_cents].max, operation_key: operation_key, kind: 'reversal')
      end

      def mutate(original:, amount_cents:, operation_key:, kind: 'refund')
        Guard.validate!(@identity)
        raise BindingError, 'Original simulation money not found' unless original.payment_identity_id == @identity.id && %w[captured partial].include?(original.state)
        digest = Snapshot.digest(original: original.raw_id, amount: amount_cents, kind: kind)
        record = SimulatedPaymentRecord.create_or_find_by!(payment_identity: @identity, operation_key: operation_key) do |row|
          row.assign_attributes(kind: kind, payload_digest: digest, original_reference: original.raw_id, amount_cents: amount_cents,
            raw_id: "sim_#{SecureRandom.hex(16)}", state: original.scenario == 'refund_decline' ? 'failed' : 'succeeded', scenario: original.scenario,
            facts: { 'dispatched_at' => SimulationClock.for(@identity).now.iso8601 })
        end
        raise Conflict, 'Simulation operation payload changed' unless record.payload_digest == digest
        record
      end
    end
  end
end
