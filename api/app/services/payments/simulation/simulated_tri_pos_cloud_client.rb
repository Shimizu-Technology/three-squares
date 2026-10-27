module Payments
  module Simulation
    class SimulatedTriPosCloudClient
      def self.response(record, now:)
        return '{invalid' if record.scenario == 'malformed_response'
        state = record.state
        state = 'unknown' if record.facts['visible_after'] && Time.iso8601(record.facts['visible_after']) > now
        Worldpay::TriPosParser.fixture(raw_id: record.raw_id, amount_cents: record.amount_cents,
          reference_number: record.payment_attempt&.reference_number.to_s, status: state)
      end
    end
  end
end
