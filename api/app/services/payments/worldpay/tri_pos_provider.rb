# frozen_string_literal: true

module Payments
  module Worldpay
    class TriPosProvider < BaseProvider
      def initialize(identity, runtime_factory: nil)
        super(identity)
        @runtime_factory = runtime_factory || ->(attempt) { TriPosRuntime.new(identity: identity, profile: TerminalContext.validate!(attempt: attempt).fetch('profile')) }
      end

      def preflight(attempt:)
        TerminalContext.validate!(attempt: attempt)
        runtime(attempt)
        true
      end

      def sale(attempt:)
        saved = TerminalContext.validate!(attempt: attempt, available: true)
        unless attempt.dispatched_at && attempt.payment_terminal.leased_attempt_id == attempt.id
          raise BindingError, 'triPOS sale requires the committed original dispatch and lane claim'
        end
        current = runtime(attempt)
        caps = current.profile.fetch('capabilities')
        observation = current.client.sale(lane_id: lane(saved), amount_cents: attempt.requested_cents, reference: attempt.reference_number.to_s,
          configuration: {'allowPartialApprovals' => false, 'allowDebit' => false, 'checkForDuplicateTransactions' => true,
            'allowedPaymentTypes' => caps.fetch('allowed_payment_types'), 'userInputTimeout' => caps.fetch('user_input_timeout')})
        observe(attempt, observation, current)
      end

      def query(attempt:)
        saved = TerminalContext.validate!(attempt: attempt)
        return unknown(attempt, 'terminal_sale_not_dispatched') unless attempt.dispatched_at
        current = runtime(attempt)
        zone = ActiveSupport::TimeZone[current.profile.fetch('capabilities').fetch('reporting_time_zone')]
        # The reference/terminal/identity remain frozen. A query window is not a
        # replacement operation and its end never releases financial claims.
        observation = current.client.query(reference: attempt.reference_number.to_s, terminal_id: saved.fetch('terminal_id'),
          begin_time: (attempt.dispatched_at - 5.minutes).in_time_zone(zone).strftime('%Y-%m-%d %H:%M:%S'),
          end_time: [Time.current + 5.minutes, attempt.dispatched_at + 1.minute].max.in_time_zone(zone).strftime('%Y-%m-%d %H:%M:%S'),
          transaction_id: attempt.raw_provider_id)
        observe(attempt, observation, current)
      end

      # /cancel is only for pre-read. An ordinary dispatched sale remains under
      # query recovery; the persisted cancellation intent blocks late fulfillment.
      def cancel(attempt:) = query(attempt: attempt)

      def reverse(attempt:, operation_key:)
        TerminalContext.validate!(attempt: attempt)
        {raw_id: nil, status: 'unknown', amount_cents: [attempt.captured_cents, attempt.approved_cents].max}
      end
      alias_method :query_reversal, :reverse

      def refund(**)
        raise UnsupportedCapability, 'Assigned linked-return, debit refund and mutation recovery contracts are required'
      end
      def query_refund(**) = {raw_id: nil, status: 'unknown', amount_cents: 0}

      private

      def lane(saved)
        value = saved.fetch('lane_id')
        raise BindingError, 'Assigned triPOS lane must be 1–999999' unless value.match?(/\A[1-9][0-9]{0,5}\z/)
        value.to_i
      end

      def runtime(attempt)
        @runtimes ||= {}
        @runtimes[attempt.id] ||= @runtime_factory.call(attempt)
      end

      def unknown(attempt, reason)
        Result.new(status: 'unknown', identity_id: identity.id, raw_id: nil, requested_cents: attempt.requested_cents,
          approved_cents: 0, captured_cents: 0, currency: attempt.currency, metadata: {reason: reason})
      end

      def observe(attempt, observation, current)
        result = TriPosResult.call(attempt: attempt, response: observation, profile: current.profile)
        AttemptLock.call(attempt) do |session, stored, _, order|
          AttemptLock.validate!(session, stored, order)
          metadata = stored.provider_metadata.deep_dup
          if result.metadata[:financial_ambiguity] && !metadata['worldpay_financial_quarantine']
            metadata['worldpay_financial_quarantine'] = {'observed_at' => Time.current.iso8601(6),
              'reason' => result.metadata[:reason], 'observation_digest' => Snapshot.digest(observation)}
            stored.update!(provider_metadata: metadata)
          end
          result = unknown(stored, 'financial_quarantine_requires_explicit_resolution') if metadata['worldpay_financial_quarantine']
        end
        result
      end
    end
  end
end
