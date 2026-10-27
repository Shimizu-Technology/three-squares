# frozen_string_literal: true

module Payments
  module Simulation
    # Synthetic host observations shaped like the published native query schema.
    # They pass through the SAME parser/context normalization as the real port.
    class NativeTriPosClient
      CONTRACT = {'usd_query_contract' => true, 'query_completeness_approved' => true,
        'captured_statuses' => %w[1 15], 'declined_statuses' => ['2'], 'cancelled_statuses' => ['17'],
        'sale_types' => ['CreditCardSale']}.freeze

      def self.profile(attempt)
        saved = TerminalContext.validate!(attempt: attempt).fetch('profile')
        saved.merge('capabilities' => saved.fetch('capabilities').merge(CONTRACT))
      end

      def self.sale_response(record)
        attempt = record.payment_attempt
        Guard.validate!(attempt.payment_identity)
        return Worldpay::TriPosResponseParser.call('{invalid', operation: :sale) if record.scenario == 'malformed_response'
        approved = record.facts.fetch('approved_cents', 0)
        wire = JSON.generate('_hasErrors' => false, '_errors' => [],
          'transactionId' => record.raw_id, 'terminalId' => attempt.snapshot.dig('collection', 'terminal', 'terminal_id'),
          'currencyCode' => attempt.currency, 'isApproved' => %w[captured partial].include?(record.state),
          'approvedAmount' => Worldpay::Money::DecimalLexeme.new(Worldpay::Money.format(approved, allow_zero: true)),
          'totalAmount' => Worldpay::Money::DecimalLexeme.new(Worldpay::Money.format(approved, allow_zero: true)),
          '_processor' => {'expressResponseCode' => record.state == 'failed' ? '20' : (record.state == 'partial' ? '5' : '0'), 'hostResponseCode' => '00'},
          'accountNumber' => 'XXXXXXXXXXXX4242', 'cardLogo' => 'Simulated card', 'entryMode' => 'Simulated tap',
          'approvalNumber' => 'SIMULATED', 'emv' => {'tags' => [{'key' => '95', 'value' => '0000000000'}, {'key' => '9B', 'value' => 'E800'}]})
        Worldpay::TriPosResponseParser.call(wire, operation: :sale)
      end

      def self.response(record, now:)
        attempt = record.payment_attempt
        identity = Guard.validate!(attempt.payment_identity)
        return Worldpay::TriPosResponseParser.call('{invalid', operation: :query) if record.scenario == 'malformed_response'
        visible = !record.facts['visible_after'] || Time.iso8601(record.facts['visible_after']) <= now
        visible = false if record.scenario == 'duplicate' && record.facts.fetch('query_count', 0) <= 1
        rows = []
        if visible && %w[captured partial failed cancelled].include?(record.state)
          approved = record.facts.fetch('approved_cents', 0)
          code = record.state == 'failed' ? '20' : (record.state == 'partial' ? '5' : '0')
          status_code = {'captured' => '1', 'partial' => '1', 'failed' => '2', 'cancelled' => '17'}.fetch(record.state)
          account = identity.external_account_id
          rows << {'AccountId' => {'Value' => account}, 'accountId' => account,
            'acceptorId' => identity.external_acceptor_id || "simulated:#{identity.id}",
            'transactionId' => record.raw_id, 'referenceNumber' => attempt.reference_number.to_s,
            'terminalId' => attempt.snapshot.dig('collection', 'terminal', 'terminal_id'), 'transactionType' => 'CreditCardSale',
            'transactionStatus' => record.state, 'transactionStatusCode' => status_code, 'expressResponseCode' => code, 'HostResponseCode' => '00',
            'transactionAmount' => Worldpay::Money::DecimalLexeme.new(Worldpay::Money.format(record.amount_cents)),
            'approvedAmount' => Worldpay::Money::DecimalLexeme.new(Worldpay::Money.format(approved, allow_zero: true)),
            'cardNumberMasked' => 'XXXXXXXXXXXX4242', 'cardLogo' => 'Simulated card', 'entryMode' => 'Simulated tap', 'approvalNumber' => 'SIMULATED'}
        end
        wire = JSON.generate('_hasErrors' => false, '_errors' => [], 'reportingData' => rows)
        Worldpay::TriPosResponseParser.call(wire, operation: :query)
      end
    end
  end
end
