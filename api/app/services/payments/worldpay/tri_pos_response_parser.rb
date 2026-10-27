# frozen_string_literal: true

require "json"
require_relative "money"

module Payments
  module Worldpay
    # Native triPOS 5.0.4 observations, deliberately NOT the TriPosParser/Outcome
    # normalization contract. No flag, response code, or HTTP status authorizes
    # money here. Parent policy must correlate identity, context and its contract.
    class TriPosResponseParser
      MAX_BYTES = 2 * 1024 * 1024
      MAX_DEPTH = 16
      MAX_NODES = 65_000
      MAX_ITEMS = 1000
      MAX_STRING_BYTES = 4096
      MAX_NUMERIC_BYTES = 32
      JSON_TOKENS = /"(?:\\.|[^"\\])*"|(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/m
      # The repository pins 2.18.1. Older versions may silently ignore the strict
      # duplicate-key option; fail closed rather than rely on Hash hooks (which
      # some JSON implementations bypass).
      STRICT_JSON_SUPPORTED = (JSON::VERSION.split(".").map(&:to_i) <=> [ 2, 18, 1 ]) >= 0
      OPERATIONS = %i[sale query pre_read_cancel pair lane lane_status update_lane delete_lane].freeze
      FINANCIAL_OPERATIONS = %i[sale query].freeze
      SALE_GAPS = %w[referenceNumber capturedAmount transactionStatus transactionType].freeze
      QUERY_GAPS = %w[currency capturedAmount pagination completeness].freeze
      SALE_TEXT = {
        "transactionId" => :transaction_id, "terminalId" => :terminal_id, "currencyCode" => :currency_code,
        "paymentType" => :payment_type, "statusCode" => :status_code, "transactionDateTime" => :transaction_date_time
      }.freeze
      SALE_MONEY = { "approvedAmount" => :approved_amount_cents, "subTotalAmount" => :subtotal_amount_cents, "totalAmount" => :total_amount_cents }.freeze
      SALE_FLAGS = { "isApproved" => :is_approved, "isOffline" => :is_offline, "transactionStored" => :transaction_stored }.freeze
      PROCESSOR_TEXT = { "expressResponseCode" => :express_response_code, "hostResponseCode" => :host_response_code,
        "responseCode" => :response_code, "processorName" => :processor_name }.freeze
      QUERY_TEXT = {
        "accountId" => :account_id, "acceptorId" => :acceptor_id, "applicationId" => :application_id,
        "transactionId" => :transaction_id, "referenceNumber" => :reference_number, "terminalId" => :terminal_id,
        "transactionStatus" => :transaction_status, "transactionStatusCode" => :transaction_status_code,
        "transactionType" => :transaction_type, "expressResponseCode" => :express_response_code,
        "HostResponseCode" => :host_response_code, "approvalNumber" => :approval_number,
        "expressTransactionDate" => :express_transaction_date, "expressTransactionTime" => :express_transaction_time,
        "hostBatchId" => :host_batch_id, "hostItemId" => :host_item_id, "avsResponseCode" => :avs_response_code,
        "cvvResponseCode" => :cvv_response_code
      }.freeze
      QUERY_MONEY = { "approvedAmount" => :approved_amount_cents, "transactionAmount" => :transaction_amount_cents }.freeze
      QUERY_REQUIRED = %w[AccountId accountId acceptorId transactionId referenceNumber terminalId transactionAmount approvedAmount transactionStatus transactionStatusCode transactionType expressResponseCode].freeze
      LANE_TEXT = { "terminalId" => :terminal_id, "description" => :description, "modelNumber" => :model_number,
        "serialNumber" => :serial_number, "applicationVersion1" => :application_version_1, "applicationVersion2" => :application_version_2 }.freeze
      IDENTIFIER_FIELDS = %i[transaction_id terminal_id reference_number account_id acceptor_id application_id
                             account_id_value host_batch_id host_item_id approval_number].freeze

      def self.call(wire, operation:)
        new(operation).parse(wire)
      rescue Money::Invalid => error
        unknown(operation: operation, reason: error.message)
      rescue JSON::ParserError => error
        unknown(operation: operation, reason: error.message.start_with?("duplicate key ") ? "duplicate_key" : "malformed_json")
      rescue EncodingError, ArgumentError
        unknown(operation: operation, reason: "malformed_json")
      end

      def self.unknown(operation:, reason:)
        operation = :unsupported unless OPERATIONS.include?(operation)
        hints = [ reason ]
        hints << "possible_financial_result" if FINANCIAL_OPERATIONS.include?(operation)
        freeze_tree(operation: operation, authorizing: false, financial_outcome: :unknown,
          financial_operation: FINANCIAL_OPERATIONS.include?(operation), observations: {}, rows: [],
          malformed_rows: 0, complete: false, ambiguity_hints: hints, schema_gaps: gaps(operation))
      end

      # Synthetic values following published paths. Goes THROUGH the real parser;
      # this is not a certification fixture or a shortcut to financial success.
      def self.fixture(operation: :sale, **overrides)
        data = case operation
        when :sale
          { "_hasErrors" => false, "_errors" => [], "_processor" => { "expressResponseCode" => "0", "hostResponseCode" => "00" },
            "transactionId" => "synthetic-transaction", "terminalId" => "synthetic-terminal", "currencyCode" => "USD",
            "approvedAmount" => Money::DecimalLexeme.new("0.29"), "subTotalAmount" => Money::DecimalLexeme.new("0.29"),
            "totalAmount" => Money::DecimalLexeme.new("0.29"), "isApproved" => true, "isOffline" => false, "transactionStored" => false }
        when :query then { "_hasErrors" => false, "_errors" => [], "reportingData" => [] }
        when :pre_read_cancel then { "_hasErrors" => false, "_errors" => [] }
        when :lane_status then { "status" => "synthetic-unknown-status", "timeStamp" => "2026-10-27T00:00:00Z" }
        else { "laneId" => 1, "terminalId" => "synthetic-terminal" }
        end
        call(JSON.generate(data.merge(overrides.transform_keys(&:to_s))), operation: operation)
      end

      def self.gaps(operation)
        case operation
        when :sale then SALE_GAPS
        when :query then QUERY_GAPS
        else []
        end
      end

      def self.freeze_tree(value)
        case value
        when Hash then value.each { |key, item| key.freeze; freeze_tree(item) }
        when Array then value.each { |item| freeze_tree(item) }
        end
        value.freeze
      end

      def initialize(operation)
        raise Money::Invalid, "unsupported_operation" unless OPERATIONS.include?(operation)
        @operation = operation
        @result = { operation: operation, authorizing: false, financial_outcome: :unknown,
          financial_operation: FINANCIAL_OPERATIONS.include?(operation), observations: {}, rows: [],
          malformed_rows: 0, complete: false, ambiguity_hints: [], schema_gaps: self.class.gaps(operation) }
      end

      def parse(wire)
        raise Money::Invalid, "strict_json_version_required" unless STRICT_JSON_SUPPORTED
        raise Money::Invalid, "invalid_input" unless wire.is_a?(String) && wire.bytesize.between?(1, MAX_BYTES)
        text = wire.dup.force_encoding(Encoding::UTF_8)
        raise Money::Invalid, "invalid_encoding" unless text.valid_encoding?
        numeric_tokens!(text)
        # JSON.parse (unlike JSON.load) does not run object additions by default.
        # JSON 3 removes the create_additions keyword entirely.
        data = JSON.parse(text, decimal_class: Money::DecimalLexeme,
          max_nesting: MAX_DEPTH, allow_nan: false, allow_duplicate_key: false)
        bounds!(data)
        raise Money::Invalid, "invalid_root" unless data.is_a?(Hash)
        if %i[sale query pre_read_cancel].include?(@operation)
          errors!(data)
        end
        case @operation
        when :sale then sale!(data)
        when :query then query!(data)
        when :pre_read_cancel then @result[:ambiguity_hints] << "pre_read_only_no_financial_evidence"
        when :lane_status then @result[:observations] = connection!(data)
        when :delete_lane
          # The DELETE endpoint declares no response schema. Do not manufacture
          # laneDeleted evidence from the unused DeleteLaneResponse definition.
          @result[:ambiguity_hints] << "delete_response_has_no_published_schema"
        when :update_lane then @result[:ambiguity_hints] << "description_update_contract_unverified"
        else lane!(data)
        end
        @result[:ambiguity_hints] << "assigned_contract_and_context_required" if FINANCIAL_OPERATIONS.include?(@operation)
        self.class.freeze_tree(@result)
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end
      alias_method :to_s, :inspect

      private

      def numeric_tokens!(wire)
        # Skip complete quoted strings, then bound numeric lexemes BEFORE JSON
        # allocates big integers. Decimal tokens retain their exact text through
        # DecimalLexeme. The sole lossy integer spelling is -0; reject it before
        # the JSON library can turn it into unsigned Integer zero.
        wire.scan(JSON_TOKENS) do |number|
          token = number.first
          next unless token
          raise Money::Invalid, "numeric_token_limit" if token.bytesize > MAX_NUMERIC_BYTES
          raise Money::Invalid, "negative_zero" if token == "-0"
        end
      end

      def bounds!(data)
        stack = [ [ data, 1 ] ]
        nodes = 0
        until stack.empty?
          item, depth = stack.pop
          nodes += 1
          raise Money::Invalid, "node_limit" if nodes > MAX_NODES
          raise Money::Invalid, "depth_limit" if depth > MAX_DEPTH
          case item
          when Hash
            raise Money::Invalid, "item_limit" if item.size > MAX_ITEMS
            item.each do |key, value|
              raise Money::Invalid, "invalid_key" unless key.is_a?(String) && key.bytesize <= 128
              stack << [ value, depth + 1 ]
            end
          when Array
            raise Money::Invalid, "item_limit" if item.size > MAX_ITEMS
            item.each { |value| stack << [ value, depth + 1 ] }
          when String
            raise Money::Invalid, "string_limit" if item.bytesize > MAX_STRING_BYTES
          when Float
            raise Money::Invalid, "inexact_numeric_token"
          end
        end
      end

      def errors!(data)
        unless [ true, false ].include?(data["_hasErrors"]) && data["_errors"].is_a?(Array) && data["_errors"].all? { |error| error.is_a?(Hash) }
          raise Money::Invalid, "invalid_error_envelope"
        end
        @result[:observations].merge!(has_errors: data["_hasErrors"], error_count: data["_errors"].size)
        @result[:ambiguity_hints] << "provider_errors" if data["_hasErrors"] || data["_errors"].any?
        if data["_hasErrors"] != data["_errors"].any?
          @result[:ambiguity_hints] << "inconsistent_error_envelope"
        end
      end

      def sale!(data)
        facts = @result[:observations]
        copy_text!(data, facts, SALE_TEXT)
        copy_money!(data, facts, SALE_MONEY)
        SALE_FLAGS.each do |key, target|
          next unless data.key?(key)
          raise Money::Invalid, "invalid_sale_flag" unless [ true, false ].include?(data[key])
          facts[target] = data[key]
        end
        processor = data["_processor"]
        raise Money::Invalid, "invalid_processor" unless processor.is_a?(Hash)
        facts[:processor] = {}
        copy_text!(processor, facts[:processor], PROCESSOR_TEXT)
        missing = (%w[transactionId terminalId approvedAmount totalAmount currencyCode isApproved] - data.keys)
        missing << "_processor.expressResponseCode" unless processor.key?("expressResponseCode")
        facts[:missing_fields] = missing
        @result[:ambiguity_hints] << "missing_sale_observations" if missing.any?
        @result[:ambiguity_hints] << "offline_or_stored" if facts[:is_offline] || facts[:transaction_stored]
        # Preserve contradictory flags/amounts as unknown evidence; never map a
        # vendor statusCode or partial amount to captured/declined/cancelled.
        if facts[:is_approved] == false && facts.fetch(:approved_amount_cents, 0).positive?
          @result[:ambiguity_hints] << "approval_amount_flag_conflict"
        end
        facts[:receipt] = receipt!(data, "accountNumber")
      end

      def query!(data)
        rows = data["reportingData"]
        raise Money::Invalid, "invalid_reporting_data" unless rows.is_a?(Array)
        @result[:rows] = rows.each_with_index.map do |row, index|
          query_row!(row, index)
        rescue Money::Invalid
          @result[:malformed_rows] += 1
          { index: index, malformed: true, observations: {}, ambiguity_hints: [ "malformed_reporting_row", "possible_financial_result" ] }
        end
        @result[:ambiguity_hints] << "malformed_reporting_rows" if @result[:malformed_rows].positive?
        @result[:ambiguity_hints] << "multiple_reporting_rows" if rows.size > 1
        @result[:ambiguity_hints] << "reporting_limit_reached" if rows.size == MAX_ITEMS
        @result[:ambiguity_hints] << "empty_report_is_not_no_charge_proof" if rows.empty?
        ids = @result[:rows].filter_map { |row| row[:observations][:transaction_id] }
        @result[:ambiguity_hints] << "duplicate_transaction_ids" if ids.uniq.size != ids.size
        @result[:ambiguity_hints] << "report_completeness_unproven"
      end

      def query_row!(row, index)
        raise Money::Invalid, "invalid_reporting_row" unless row.is_a?(Hash)
        facts = {}
        copy_text!(row, facts, QUERY_TEXT)
        copy_money!(row, facts, QUERY_MONEY)
        if row.key?("AccountId")
          wrapper = row["AccountId"]
          raise Money::Invalid, "invalid_account_wrapper" unless wrapper.is_a?(Hash)
          facts[:account_id_value] = text!(wrapper["Value"], identifier: true)
        end
        facts[:receipt] = receipt!(row, "cardNumberMasked")
        missing = QUERY_REQUIRED - row.keys
        conflict = facts.key?(:account_id_value) && facts.key?(:account_id) && facts[:account_id_value] != facts[:account_id]
        malformed = missing.any? || conflict
        @result[:malformed_rows] += 1 if malformed
        hints = [ "possible_financial_result", "currency_absent_from_query_schema" ]
        hints << "missing_reporting_fields" if missing.any?
        hints << "conflicting_account_fields" if conflict
        { index: index, malformed: malformed, missing_fields: missing, observations: facts, ambiguity_hints: hints }
      end

      def lane!(data)
        facts = @result[:observations]
        copy_text!(data, facts, LANE_TEXT)
        lane_id = data["laneId"]
        raise Money::Invalid, "invalid_lane_id" unless lane_id.is_a?(Integer) && lane_id.between?(1, 999_999)
        facts[:lane_id] = lane_id
        facts[:connection] = connection!(data["connectionStatus"]) if data.key?("connectionStatus")
        @result[:ambiguity_hints] << "lane_metadata_is_not_payment_readiness"
      end

      def connection!(data)
        raise Money::Invalid, "invalid_connection_status" unless data.is_a?(Hash)
        { status: text!(data["status"]), time_stamp: text!(data["timeStamp"]), cached: true, maximum_staleness_seconds: 75 }
      end

      def receipt!(data, account_key)
        result = {}
        copy_text!(data, result, { "cardLogo" => :card_logo, "entryMode" => :entry_mode, "approvalNumber" => :approval_number })
        if data.key?(account_key) && !data[account_key].nil?
          number = data[account_key]
          unless number.is_a?(String) && /\A[0-9xX* -]{4,32}\z/.match?(number)
            raise Money::Invalid, "invalid_masked_account"
          end
          normalized = number.delete(" -")
          raise Money::Invalid, "invalid_masked_account" unless normalized.size.between?(4, 19)
          suffix = normalized[-4, 4]
          result[:last4] = suffix if /\A[0-9]{4}\z/.match?(suffix)
        end
        if data['emv'].is_a?(Hash) && data['emv']['tags'].is_a?(Array)
          tags = data['emv']['tags'].each_with_object({}) do |tag, safe|
            next unless tag.is_a?(Hash) && %w[95 9B 9F06 9F26 9F27 9F36].include?(tag['key'])
            value = tag['value']
            safe[tag['key']] = value if value.is_a?(String) && value.match?(/\A[0-9A-Fa-f]{2,32}\z/)
          end
          result[:emv] = tags unless tags.empty?
        end
        # PAN/track tags (5A/57), signature, raw processor payload, expiry,
        # cardholder name, token, _links and _logs never survive this allowlist.
        result
      end

      def copy_text!(source, destination, mapping)
        mapping.each { |key, target| destination[target] = text!(source[key], identifier: IDENTIFIER_FIELDS.include?(target)) if source.key?(key) }
      end

      def copy_money!(source, destination, mapping)
        mapping.each do |key, target|
          next unless source.key?(key)
          value = source[key]
          # Schema number fields must be JSON numeric tokens, not numeric strings.
          raise Money::Invalid, "invalid_numeric_amount" unless value.is_a?(Integer) || value.is_a?(Money::DecimalLexeme)
          destination[target] = Money.parse(value, allow_zero: true)
        end
      end

      def text!(value, identifier: false)
        unless value.is_a?(String) && value.bytesize.between?(1, 256) && !value.match?(/[[:cntrl:]]/) &&
            (identifier || !value.match?(/(?:[0-9][ -]?){12,}/)) && !value.match?(/[%^;=]/)
          raise Money::Invalid, "invalid_observation_text"
        end
        value.dup
      end
    end
  end
end
