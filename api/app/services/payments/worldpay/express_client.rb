# frozen_string_literal: true

require_relative "xml_builder"
require_relative "hpp_setup"
require_relative "express_report_parser"

module Payments
  module Worldpay
    # A backend port, not a provider/finalizer. Transport is mandatory and
    # injected; constructing this client can never open a network connection.
    class ExpressClient
      FINANCIAL_METHODS = {
        credit_card_sale: "CreditCardSale", credit_card_authorization: "CreditCardAuthorization",
        credit_card_authorization_completion: "CreditCardAuthorizationCompletion", credit_card_return: "CreditCardReturn"
      }.freeze
      OTHER_METHODS = {
        credit_card_void: "CreditCardVoid", credit_card_reversal: "CreditCardReversal",
        batch_totals_query: "BatchTotalsQuery", batch_close: "BatchClose"
      }.freeze
      TOKEN_METHODS = {
        payment_account_create: "PaymentAccountCreate", payment_account_create_with_trans_id: "PaymentAccountCreateWithTransID",
        payment_account_query: "PaymentAccountQuery", payment_account_update: "PaymentAccountUpdate", payment_account_delete: "PaymentAccountDelete"
      }.freeze
      MAX_REPORT_ROWS = 10_000

      def initialize(configuration:, transport:, wire_contract:, setup_contract: nil, report_contract: nil,
                     pagination_request: nil, observation_contracts: {})
        raise Configuration::Invalid, "injected_transport_required" unless transport.respond_to?(:call)
        @configuration, @transport = configuration, transport
        @builder = XmlBuilder.new(configuration: configuration, contract: wire_contract)
        @setup_contract = immutable(setup_contract)
        @report_contract = immutable(report_contract)
        @pagination_request = immutable(pagination_request)
        @observation_contracts = immutable(observation_contracts)
      end

      FINANCIAL_METHODS.each do |name, method|
        define_method(name) do |fields:, amount_cents:, idempotency_key:|
          Money.validate_cents(amount_cents)
          observe(method, fields: fields, amount_cents: amount_cents, idempotency_key: idempotency_key)
        end
      end

      OTHER_METHODS.each do |name, method|
        define_method(name) do |fields:, idempotency_key:, amount_cents: nil|
          observe(method, fields: fields, amount_cents: amount_cents, idempotency_key: idempotency_key)
        end
      end

      TOKEN_METHODS.each do |name, method|
        define_method(name) do |fields:, token_scheme:, consent:|
          unless consent == true && @configuration.token_scheme && token_scheme == @configuration.token_scheme
            raise Configuration::Invalid, "selected_token_scheme_and_consent_required"
          end
          observe(method, fields: fields)
        end
      end

      def transaction_setup(fields:, amount_cents:, idempotency_key:, presentation:)
        raise Configuration::Invalid, "setup_wire_contract_required" unless @setup_contract
        raise Configuration::Invalid, "invalid_hpp_presentation" unless %w[legacy premium].include?(presentation)
        Money.validate_cents(amount_cents)
        wire = @builder.build(method: "TransactionSetup", fields: fields, amount_cents: amount_cents, idempotency_key: idempotency_key)
        xml = send_wire(:transaction, wire)
        return HppSetup.new(status: "unknown", metadata: { contract_verified: false, parse_error: "transport_outcome_unknown" }) unless xml
        HppSetup.parse(xml, configuration: @configuration, presentation: presentation, contract: @setup_contract)
      end

      def transaction_query_pagination(fields:, page_number:, page_size: 1000)
        fixed_size = @pagination_request.is_a?(Hash) && @pagination_request[:fixed_page_size]
        keys = fixed_size ? %i[page_number_path fixed_page_size] : %i[page_number_path page_size_path]
        unless page_number.is_a?(Integer) && page_number.between?(1, 1000) && page_size.is_a?(Integer) && page_size.between?(1, 1000) &&
            @pagination_request.is_a?(Hash) && @pagination_request.keys.length == keys.length && (@pagination_request.keys - keys).empty? && @report_contract.is_a?(Hash) &&
            (!fixed_size || (fixed_size == 1000 && page_size == fixed_size && @report_contract[:fixed_page_size] == fixed_size)) &&
            (!!@report_contract[:item_count_paths] == !!fixed_size)
          raise Configuration::Invalid, "pagination_contract_and_bounds_required"
        end
        values = mutable_fields(fields)
        parameters = { page_number_path: page_number.to_s }
        parameters[:page_size_path] = page_size.to_s unless fixed_size
        parameters.each do |key, value|
          path = @pagination_request[key]
          unless path.is_a?(Array) && path.length == 2 && path.all? { |part| part.is_a?(String) }
            raise Configuration::Invalid, "invalid_pagination_path"
          end
          section, field = path
          values[section] ||= {}
          raise Configuration::Invalid, "pagination_field_conflict" if values[section].key?(field)
          values[section][field] = value
        end
        wire = @builder.build(method: "TransactionQueryPagination", fields: values)
        xml = send_wire(:reporting, wire)
        return report_result([], false, "transport_outcome_unknown", 0) unless xml
        report = ExpressReportParser.call(xml, configuration: @configuration, contract: @report_contract, requested_page: page_number)
        return report_result([], false, "report_page_size_limit", 0) if report[:rows].length > page_size
        report
      end

      # Collect completely before the parent persists a checkpoint. Completeness
      # refers to report enumeration only, never to financial/payment success.
      def query_all(fields:, page_size: 1000, max_pages: 1000, max_rows: MAX_REPORT_ROWS)
        unless max_pages.is_a?(Integer) && max_pages.between?(1, 1000) && max_rows.is_a?(Integer) && max_rows.between?(1, MAX_REPORT_ROWS)
          raise Configuration::Invalid, "invalid_report_bounds"
        end
        rows, seen, pages, expected_pages, expected_total = [], {}, 0, nil, nil
        1.upto(max_pages) do |number|
          report = transaction_query_pagination(fields: fields, page_number: number, page_size: page_size)
          error = report.dig(:metadata, :parse_error)
          return report_result(rows, false, error, pages) if error
          unless report[:page] == number && (!expected_pages || expected_pages == report[:page_count]) &&
              (!expected_total || expected_total == report[:total_count])
            return report_result(rows, false, "inconsistent_report_pagination", pages)
          end
          pages = number
          expected_pages ||= report[:page_count]
          expected_total ||= report[:total_count]
          report[:rows].each do |row|
            return report_result(rows, false, "report_transaction_id_required", pages) unless row[:raw_id]
            key = @configuration.identity_key + [ row[:raw_id] ]
            if seen.key?(key)
              return report_result(rows, false, "overlapping_row_conflict", pages) if @report_contract[:item_count_paths] || seen[key] != row
              next
            end
            return report_result(rows, false, "report_aggregate_row_limit", pages) if rows.length >= max_rows
            seen[key] = row
            rows << row
          end
          if number == expected_pages
            if rows.empty? && expected_total.nil?
              return report_result(rows, false, "report_count_proof_required", pages)
            end
            if expected_total && rows.length != expected_total
              return report_result(rows, false, "incomplete_report_total", pages)
            end
            return report_result(rows, true, nil, pages)
          end
        end
        report_result(rows, false, "report_page_limit", pages)
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end

      private

      def observe(method, fields:, amount_cents: nil, idempotency_key: nil)
        wire = @builder.build(method: method, fields: fields, amount_cents: amount_cents, idempotency_key: idempotency_key)
        xml = send_wire(XmlBuilder.interface(method), wire)
        return ExpressReportParser.unknown("transport_outcome_unknown") unless xml
        ExpressReportParser.observe(xml, configuration: @configuration, method: method, contract: @observation_contracts.fetch(method, {}))
      end

      def send_wire(interface, wire)
        @transport.call(interface: interface, body: wire)
      rescue StandardError
        # Injected ports also cannot leak credentials through exception messages.
        nil
      end

      def report_result(rows, complete, error, pages)
        { status: "unknown", complete: complete, rows: rows, pages_read: pages,
          metadata: { contract_verified: false, parse_error: error } }
      end

      def mutable_fields(fields)
        unless fields.is_a?(Hash) && fields.values.all? { |entries| entries.is_a?(Hash) }
          raise Configuration::Invalid, "invalid_wire_fields"
        end
        fields.transform_values(&:dup)
      end

      def immutable(value, depth = 0)
        raise Configuration::Invalid, "contract_depth_limit" if depth > 16
        case value
        when Hash then value.to_h { |key, entry| [ immutable(key, depth + 1), immutable(entry, depth + 1) ] }.freeze
        when Array then value.map { |entry| immutable(entry, depth + 1) }.freeze
        when String then value.dup.freeze
        when Symbol, Integer, NilClass, TrueClass, FalseClass then value
        else raise Configuration::Invalid, "invalid_contract_value"
        end
      end
    end
  end
end
