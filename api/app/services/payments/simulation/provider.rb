module Payments
  module Simulation
    class Provider < BaseProvider
      def initialize(identity)
        Guard.validate!(identity)
        super
      end
      def engine
        @engine ||= ScenarioEngine.new(identity)
      end

      def setup(attempt:)
        record = engine.setup(attempt)
        { raw_id: record.raw_id, flow: 'simulated_fields', client_secret: engine.handle_for(record) }
      end
      alias_method :collection, :setup

      def collect(attempt:, scenario:, handle:, mode: 'token')
        record = engine.collect(attempt: attempt, scenario: scenario, handle: handle, mode: mode)
        # The local host may commit a payment and lose its HTTP response.
        # Only a later query provides financial evidence to the application.
        raise Error, 'Simulated response lost; check the saved payment' if %w[timeout_after_approval cancel_race late_event].include?(record.scenario)
        if attempt.collection_mode == 'terminal' && attempt.snapshot.dig('collection', 'terminal') &&
            %w[captured partial failed].include?(record.state) && !%w[duplicate query_lag].include?(record.scenario)
          response = NativeTriPosClient.sale_response(record)
          result = Worldpay::TriPosResult.call(attempt: attempt, response: response, profile: NativeTriPosClient.profile(attempt), simulated: true)
          return result.with(metadata: result.metadata.merge(compensation_required: %w[avs_fail cvv_fail].include?(record.scenario), simulated: true))
        end
        query(attempt: attempt)
      end

      def query(attempt:)
        record = engine.query(attempt)
        pos = attempt.collection_mode == 'terminal'
        if pos && attempt.snapshot.dig('collection', 'terminal')
          response = NativeTriPosClient.response(record, now: SimulationClock.for_attempt(attempt).now)
          result = Worldpay::TriPosResult.call(attempt: attempt, response: response, profile: NativeTriPosClient.profile(attempt), simulated: true)
          return result.with(metadata: result.metadata.merge(cancellable: record.state == 'collecting',
            compensation_required: %w[avs_fail cvv_fail].include?(record.scenario), simulated: true,
            reader_state: record.state == 'collecting' ? 'waiting_for_card' : nil))
        end
        wire = (pos ? SimulatedTriPosCloudClient : SimulatedExpressClient).response(record, now: SimulationClock.for_attempt(attempt).now)
        parsed = (pos ? Worldpay::TriPosParser : Worldpay::ExpressParser).call(wire)
        if parsed.dig(:metadata, :parse_error)
          return Result.new(status: 'unknown', identity_id: identity.id, raw_id: nil, requested_cents: attempt.requested_cents,
            approved_cents: 0, captured_cents: 0, currency: attempt.currency, metadata: parsed[:metadata])
        end
        unless parsed[:raw_id] == record.raw_id && parsed[:requested_cents] == attempt.requested_cents && parsed[:reference_number].to_s == attempt.reference_number.to_s
          raise BindingError, 'Simulated processor result binding mismatch'
        end
        facts = parsed.slice(:status, :raw_id, :requested_cents, :approved_cents, :captured_cents, :currency, :metadata)
        facts[:metadata] = (facts[:metadata] || {}).merge(cancellable: record.state == 'collecting',
          compensation_required: %w[avs_fail cvv_fail].include?(record.scenario), simulated: true)
        Result.new(**facts, identity_id: identity.id)
      end

      def cancel(attempt:)
        record = engine.query(attempt)
        if record.scenario == 'cancel_race' && record.facts['visible_after'] && Time.iso8601(record.facts['visible_after']) > SimulationClock.for_attempt(attempt).now
          return Result.new(status: 'cancelled', identity_id: identity.id, raw_id: record.raw_id, requested_cents: attempt.requested_cents, approved_cents: 0, captured_cents: 0, currency: 'USD', metadata: { simulated: true })
        end
        record.with_lock { record.update!(state: 'cancelled') if %w[collecting failed].include?(record.state) }
        query(attempt: attempt)
      end

      def reverse(attempt:, operation_key:)
        normalize(engine.reverse(attempt: attempt, operation_key: operation_key))
      end

      def query_reversal(attempt:, operation_key:)
        engine.validate_attempt!(attempt)
        query_refund(reference: attempt.compensation_provider_id, operation_key: operation_key, original_reference: attempt.raw_provider_id)
      end

      def refund(attempt:, reference:, amount_cents:, operation_key:, metadata:)
        engine.validate_attempt!(attempt) if attempt
        raise BindingError, 'Refund reference changed' if attempt && attempt.raw_provider_id != reference
        original = SimulatedPaymentRecord.find_by!(payment_identity: identity, raw_id: reference, kind: 'collection')
        row = engine.mutate(original: original, amount_cents: amount_cents, operation_key: operation_key)
        raise Error, 'Simulated refund response lost' if original.scenario == 'refund_timeout'
        normalize(row)
      end

      def query_refund(reference:, operation_key:, original_reference:)
        Guard.validate!(identity)
        row = SimulatedPaymentRecord.find_by(payment_identity: identity, operation_key: operation_key)
        return { raw_id: nil, status: 'unknown', amount_cents: 0 } unless row
        unless %w[refund reversal].include?(row.kind) && row.original_reference == original_reference && (reference.blank? || row.raw_id == reference)
          raise BindingError, 'Simulation refund binding mismatch'
        end
        normalize(row)
      end

      def query_original_charge(reference:)
        Guard.validate!(identity)
        row = SimulatedPaymentRecord.find_by!(payment_identity: identity, kind: 'collection', raw_id: reference, state: 'captured')
        { identity_id: identity.id, raw_id: row.raw_id, status: 'captured', amount_cents: row.amount_cents,
          currency: 'USD', consumption_reference: row.raw_id, order_id: row.payment_attempt.order_id }
      end

      private

      def normalize(row)
        { raw_id: row.raw_id, status: row.state, amount_cents: row.amount_cents }
      end
    end
  end
end
