# frozen_string_literal: true

module Payments
  module Worldpay
    # Wire parsing is nonauthorizing. This layer binds an authenticated response
    # to the frozen lane/operation and the explicitly assigned USD/query contract.
    class TriPosResult
      def self.call(attempt:, response:, profile:, simulated: false)
        new(attempt, response, profile, simulated).call
      end

      def initialize(attempt, response, profile, simulated)
        @attempt, @response, @caps = attempt, response, profile.fetch('capabilities')
        @terminal = TerminalContext.validate!(attempt: attempt)
        if simulated
          Simulation::Guard.validate!(attempt.payment_identity)
        elsif attempt.payment_identity.environment == 'simulated'
          raise BindingError, 'Simulated wire requires the simulation guard'
        end
        @simulated = simulated
      end

      def call
        return unknown('transport_response_unknown') if @response[:transport_failure]
        hints = @response.fetch(:ambiguity_hints, [])
        return unknown('uninspectable_financial_response', ambiguity: true) if hints.include?('possible_financial_result') || @response.fetch(:malformed_rows, 0).positive?
        facts = @response.fetch(:observations)
        if facts[:has_errors] || facts[:error_count].to_i.positive?
          return unknown('provider_communication_error', ambiguity: facts[:approved_amount_cents].to_i.positive? || @response.fetch(:rows).any?)
        end
        unless @simulated || (@response[:http_status] == 200 && @response[:request_id_echo_verified] == true && @caps['usd_query_contract'] == true)
          return unknown('authenticated_tripos_context_required')
        end
        @response[:operation] == :sale ? sale(facts) : query
      end

      def sale(facts)
        unless facts[:terminal_id] == @terminal.fetch('terminal_id') && facts[:currency_code].to_s.upcase == @attempt.currency &&
            !facts[:is_offline] && !facts[:transaction_stored] && facts[:missing_fields] == []
          return unknown('sale_binding_or_offline_policy_mismatch', ambiguity: true)
        end
        processor = facts.fetch(:processor)
        approved = facts.fetch(:approved_amount_cents)
        code = processor[:express_response_code]
        if %w[20 21].include?(code) && facts[:is_approved] == false && approved.zero?
          return result('failed', facts[:transaction_id], 0, 0, receipt: facts[:receipt])
        end
        bound_approval = facts[:is_approved] == true && facts[:transaction_id].present?
        partial_code = code.to_s.match?(/\A0*5\z/)
        if bound_approval && approved.positive? && approved < @attempt.requested_cents &&
            (partial_code || (code.to_s.match?(/\A0+\z/) && processor[:host_response_code].to_s.match?(/\A0+\z/)))
          return result('partial', facts[:transaction_id], approved, 0, receipt: facts[:receipt])
        end
        unless code.to_s.match?(/\A0+\z/) && processor[:host_response_code].to_s.match?(/\A0+\z/) && bound_approval
          return unknown('sale_approval_not_proven', ambiguity: approved.positive?)
        end
        unless approved == @attempt.requested_cents && facts[:total_amount_cents] == @attempt.requested_cents
          return unknown('sale_amount_mismatch', ambiguity: true)
        end
        receipt = facts.fetch(:receipt, {}).merge(payment_type: facts[:payment_type], processor_time: facts[:transaction_date_time]).compact
        result('captured', facts[:transaction_id], approved, approved, receipt: receipt)
      end

      def query
        rows = @response.fetch(:rows)
        return unknown('query_empty_is_not_cancellation') if rows.empty?
        return unknown('query_completeness_unassigned', ambiguity: true) unless @caps['query_completeness_approved'] == true && rows.size < TriPosResponseParser::MAX_ITEMS
        captures, declines, cancelled = [], [], []
        rows.each do |row|
          facts = row.fetch(:observations)
          identity = @attempt.payment_identity
          acceptor = @simulated ? identity.external_acceptor_id || "simulated:#{identity.id}" : identity.external_acceptor_id
          unless !row[:malformed] && facts[:account_id] == identity.external_account_id && facts[:acceptor_id] == acceptor &&
              facts[:reference_number] == @attempt.reference_number.to_s && facts[:terminal_id] == @terminal.fetch('terminal_id') &&
              @caps.fetch('sale_types').include?(facts[:transaction_type]) && facts[:transaction_id].present?
            return unknown('query_binding_mismatch', ambiguity: true)
          end
          if @caps.fetch('declined_statuses').include?(facts[:transaction_status_code]) && %w[20 21].include?(facts[:express_response_code]) && facts[:approved_amount_cents] == 0
            declines << facts
          elsif @caps.fetch('cancelled_statuses', []).include?(facts[:transaction_status_code]) && facts[:approved_amount_cents] == 0
            cancelled << facts
          elsif @caps.fetch('captured_statuses').include?(facts[:transaction_status_code]) && facts[:transaction_amount_cents] == @attempt.requested_cents &&
              facts[:approved_amount_cents].is_a?(Integer) && facts[:approved_amount_cents].between?(1, @attempt.requested_cents) &&
              ((facts[:express_response_code].to_s.match?(/\A0*5\z/) && facts[:approved_amount_cents] < @attempt.requested_cents) ||
                (facts[:express_response_code].to_s.match?(/\A0+\z/) && facts[:host_response_code].to_s.match?(/\A0+\z/)))
            captures << facts
          else
            return unknown('query_financial_proof_incomplete', ambiguity: true)
          end
        end
        return unknown('multiple_terminal_results', ambiguity: true) unless rows.one?
        return result('failed', declines.first[:transaction_id], 0, 0) if declines.one?
        return result('cancelled', cancelled.first[:transaction_id], 0, 0) if cancelled.one?
        facts = captures.fetch(0)
        return unknown('original_terminal_charge_changed', ambiguity: true) if @attempt.raw_provider_id && @attempt.raw_provider_id != facts[:transaction_id]
        return result('partial', facts[:transaction_id], facts[:approved_amount_cents], 0, receipt: facts[:receipt]) if facts[:approved_amount_cents] < @attempt.requested_cents
        result('captured', facts[:transaction_id], @attempt.requested_cents, @attempt.requested_cents, receipt: facts[:receipt])
      end

      def unknown(reason, ambiguity: false)
        result('unknown', nil, 0, 0, reason: reason, financial_ambiguity: ambiguity)
      end

      def result(status, raw_id, approved, captured, **metadata)
        Result.new(status: status, identity_id: @attempt.payment_identity_id, raw_id: raw_id,
          requested_cents: @attempt.requested_cents, approved_cents: approved, captured_cents: captured, currency: @attempt.currency,
          metadata: metadata.merge(terminal_id: @terminal['id'], simulated: @simulated))
      end
    end
  end
end
