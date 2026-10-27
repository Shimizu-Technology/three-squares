# frozen_string_literal: true

module Payments
  module Worldpay
    # Original-setup query proof only; callbacks and setup success cannot fund
    # an order. Currency/fraud guarantees come from the frozen assigned profile.
    class QueryResult
      def self.call(attempt:, report:, configuration:, profile:)
        unknown = lambda do |reason, collection_available: false|
          Result.new(status: "unknown", identity_id: attempt.payment_identity_id, raw_id: nil,
            requested_cents: attempt.requested_cents, approved_cents: 0, captured_cents: 0,
            currency: attempt.currency, metadata: { reason: reason, collection_available: collection_available })
        end
        caps = profile.fetch("capabilities")
        return unknown.call("original_setup_query_required") unless attempt.setup_id.present? && report.dig(:metadata, :queried_setup_id) == attempt.setup_id
        return unknown.call("assigned_currency_and_fraud_contract_required") unless caps["usd_query_contract"] == true && caps["fraud_policy"] == "processor_enforced"
        rows = report.fetch(:rows)
        if rows.empty? && !report.dig(:metadata, :parse_error) && /\A0+\z/.match?(report.dig(:metadata, :express_response_code).to_s)
          return unknown.call("awaiting_card", collection_available: true)
        end
        return unknown.call("incomplete_query") unless report[:complete] && !report.dig(:metadata, :parse_error)
        captures = []
        rows.each do |row|
          facts = row.fetch(:metadata, {})
          credentials = configuration.credentials
          unless row[:reference_number] == attempt.reference_number.to_s && facts[:account_id] == credentials["AccountID"] && facts[:acceptor_id] == credentials["AcceptorID"] &&
              facts[:terminal_id] == configuration.terminal_profile.dig("Terminal", "TerminalID") && facts[:transaction_type] == "CreditCardSale" && row[:raw_id].present?
            raise Payments::BindingError, "Worldpay query does not match the original intent"
          end
          # A definitive declined/expired row has no financial approval. HPP
          # permits another card entry under the SAME setup; inspect every row.
          if %w[20 21].include?(facts[:express_response_code]) && %w[2 17].include?(facts[:status_code]) && facts[:approval_number].blank?
            next
          end
          amount = Money.parse(facts[:reported_amount], currency: "USD", allow_zero: true)
          unless /\A0+\z/.match?(facts[:express_response_code].to_s) && %w[1 15].include?(facts[:status_code]) &&
              amount == attempt.requested_cents && facts[:approval_number].present?
            return unknown.call("query_financial_proof_incomplete")
          end
          captures << row
        end
        return unknown.call("declined_card_retry_available", collection_available: true) if captures.empty?
        return unknown.call("multiple_financial_transactions") unless captures.one?
        row = captures.first
        if attempt.raw_provider_id.present? && attempt.raw_provider_id != row[:raw_id]
          raise Payments::BindingError, "Worldpay original charge changed"
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
