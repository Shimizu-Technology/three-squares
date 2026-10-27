# frozen_string_literal: true

module Payments
  module Worldpay
    # Only a complete authenticated query in the frozen assigned USD/fraud
    # contract can authorize fulfillment. A return or setup response cannot.
    class QueryResult
      def self.call(attempt:, report:, configuration:, profile:)
        caps = profile.fetch("capabilities")
        unknown = lambda do |reason|
          Result.new(status: "unknown", identity_id: attempt.payment_identity_id, raw_id: nil,
            requested_cents: attempt.requested_cents, approved_cents: 0, captured_cents: 0,
            currency: attempt.currency, metadata: { reason: reason })
        end
        return unknown.call("incomplete_query") unless report[:complete] && !report.dig(:metadata, :parse_error)
        return unknown.call("original_setup_query_required") unless attempt.setup_id.present? && report.dig(:metadata, :queried_setup_id) == attempt.setup_id
        return unknown.call("assigned_currency_and_fraud_contract_required") unless caps["usd_query_contract"] == true && caps["fraud_policy"] == "processor_enforced"
        rows = report.fetch(:rows)
        return unknown.call("unique_original_transaction_required") unless rows.one?
        row = rows.first
        facts = row.fetch(:metadata, {})
        credentials = configuration.credentials
        unless row[:reference_number] == attempt.reference_number.to_s && facts[:account_id] == credentials["AccountID"] && facts[:acceptor_id] == credentials["AcceptorID"] &&
            facts[:terminal_id] == configuration.terminal_profile.dig("Terminal", "TerminalID") &&
            facts[:transaction_type] == "CreditCardSale" && row[:raw_id].present? &&
            (attempt.raw_provider_id.blank? || attempt.raw_provider_id == row[:raw_id])
          raise Payments::BindingError, "Worldpay query does not match the original intent"
        end
        # TransactionAmount is not proven to be ApprovedAmount on partial
        # outcomes. Keep those and all unrecognized states quarantined.
        amount = Money.parse(facts[:reported_amount], currency: "USD", allow_zero: true)
        unless /\A0+\z/.match?(facts[:express_response_code].to_s) && %w[1 6 15].include?(facts[:status_code]) &&
            amount == attempt.requested_cents && facts[:approval_number].present?
          return unknown.call("query_financial_proof_incomplete")
        end
        Result.new(status: "captured", identity_id: attempt.payment_identity_id, raw_id: row[:raw_id],
          requested_cents: attempt.requested_cents, approved_cents: attempt.requested_cents, captured_cents: attempt.requested_cents,
          currency: attempt.currency, metadata: { currency_source: "assigned_usd_merchant_contract", query_authenticated: true })
      rescue Money::Invalid
        unknown.call("query_amount_invalid")
      end
    end
  end
end
