module Payments
  module Simulation
    # Local transport port. Fixtures deliberately pass through the real parser.
    class SimulatedExpressClient
      def self.response(record, now:)
        return '<broken' if record.scenario == 'malformed_response'
        state = record.state
        state = 'unknown' if record.facts['visible_after'] && Time.iso8601(record.facts['visible_after']) > now
        code = case record.scenario
        when 'expired' then '21'
        when 'host_error' then record.facts.fetch('query_count', 0) <= 1 ? '1002' : '0'
        when 'duplicate' then record.facts.fetch('query_count', 0) <= 1 ? '22' : '0'
        else nil
        end
        Worldpay::ExpressParser.fixture(raw_id: record.raw_id, amount_cents: record.amount_cents,
          reference_number: record.payment_attempt&.reference_number.to_s, status: state, code: code)
      end
    end
  end
end
