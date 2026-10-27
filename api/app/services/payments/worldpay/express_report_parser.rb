# frozen_string_literal: true

require_relative "hpp_setup"
require_relative "money"
require_relative "xml_builder"

module Payments
  module Worldpay
    # Observations only. No query, HTTP status or unverified vendor state can
    # approve fulfillment/refunds. The existing representative parser is unused.
    class ExpressReportParser
      Xml = HppSetup::Xml
      ROW_FIELDS = %i[raw_id reference_number provider_status amount currency].freeze
      MAX_PAGES = 1000
      MAX_ROWS = 1000

      def self.unknown(reason)
        { status: "unknown", raw_id: nil, requested_cents: nil, approved_cents: nil, captured_cents: nil, currency: nil,
          metadata: { contract_verified: false, parse_error: reason } }
      end

      def self.observe(xml, configuration:, method:, contract: {})
        interface = XmlBuilder.interface(method)
        root, response, code = envelope(xml, method, configuration.namespace(interface))
        validate_fields!(contract)
        observation = row(response, contract)
        observation[:metadata].merge!(express_response_code: code, normalized_express_response_code: code.to_i, operation: method,
          unknown_fields: Xml.unknown_paths(root, [ [ "Response", "ExpressResponseCode" ] ] + contract.values.map { |path| [ "Response" ] + path }))
        raise Xml::Invalid, "sensitive_response" if configuration.secrets_in?(observation)
        observation
      rescue Xml::Invalid, Money::Invalid => error
        unknown(error.message)
      end

      # contract: reporting_data_path, rows_path, fields, page_path, pages_path,
      # optional total_path. Paths are relative to Response, except rows_path
      # which is relative to ReportingData (or its embedded XML document root).
      def self.call(xml, configuration:, contract:)
        validate_report_contract!(contract)
        root, response, code = envelope(xml, "TransactionQueryPagination", configuration.namespace(:reporting))
        metadata = { contract_verified: false, express_response_code: code, normalized_express_response_code: code.to_i }
        raise Xml::Invalid, "report_query_not_successful" unless code.to_i.zero?
        page = count!(response, contract[:page_path], minimum: 1, maximum: MAX_PAGES)
        pages = count!(response, contract[:pages_path], minimum: 1, maximum: MAX_PAGES)
        raise Xml::Invalid, "invalid_report_page" if page > pages
        total = count!(response, contract[:total_path], minimum: 0, maximum: MAX_PAGES * MAX_ROWS) if contract[:total_path]
        data = Xml.at(response, contract[:reporting_data_path], required: true)
        if data.element_children.empty? && !data.text.strip.empty?
          # Some report contracts return escaped XML/CDATA. Parse that document
          # with the SAME bounds and security options, never entity expansion.
          data = Xml.parse(data.text)
        end
        rows = rows_at(data, contract[:rows_path]).map { |node| row(node, contract[:fields]) }
        raise Xml::Invalid, "report_row_limit" if rows.length > MAX_ROWS
        raise Xml::Invalid, "inconsistent_report_count" if total && total < rows.length
        metadata[:unknown_fields] = Xml.unknown_paths(root,
          [ [ "Response", "ExpressResponseCode" ], [ "Response" ] + contract[:reporting_data_path] ] +
          %i[page_path pages_path total_path].filter_map { |key| [ "Response" ] + contract[key] if contract[key] })
        metadata[:unknown_reporting_fields] = Xml.unknown_paths(data, [ contract[:rows_path] ])
        result = { status: "unknown", complete: false, rows: rows, page: page, page_count: pages, total_count: total, metadata: metadata }
        raise Xml::Invalid, "sensitive_response" if configuration.secrets_in?(result)
        result
      rescue Xml::Invalid, Money::Invalid => error
        { status: "unknown", complete: false, rows: [], page: nil, page_count: nil, total_count: nil,
          metadata: { contract_verified: false, parse_error: error.message } }
      end

      def self.envelope(xml, method, namespace)
        root = Xml.parse(xml)
        raise Xml::Invalid, "unexpected_response_root" unless root.name == "#{method}Response" && root.namespace&.href == namespace
        response = Xml.child(root, "Response", required: true)
        [ root, response, Xml.code(response) ]
      end

      def self.row(node, fields)
        facts = fields.to_h { |name, path| [ name, Xml.text(Xml.at(node, path)) ] }.compact
        amount = Money.parse(facts[:amount], currency: facts[:currency], allow_zero: true) if facts[:amount] && facts[:currency] == "USD"
        { status: "unknown", raw_id: facts[:raw_id], reference_number: facts[:reference_number], requested_cents: nil,
          approved_cents: nil, captured_cents: nil, currency: nil,
          metadata: { contract_verified: false, provider_status: facts[:provider_status], reported_amount: facts[:amount],
            reported_currency: facts[:currency], reported_amount_cents: amount,
            unknown_fields: Xml.unknown_paths(node, fields.values) } }
      end

      def self.rows_at(node, path)
        parent = path.length == 1 ? node : Xml.at(node, path[0...-1])
        unless parent
          raise Xml::Invalid, "unexpected_report_structure" unless node.element_children.empty? && node.text.strip.empty?
          return []
        end
        # Other repeated siblings are not silently interpreted as transactions.
        raise Xml::Invalid, "unexpected_report_structure" if parent.element_children.any? { |child| child.name != path.last }
        parent.element_children.select { |child| child.name == path.last }
      end

      def self.count!(response, path, minimum:, maximum:)
        text = Xml.text(Xml.at(response, path, required: true))
        raise Xml::Invalid, "invalid_report_count" unless text && /\A(?:0|[1-9][0-9]{0,6})\z/.match?(text) && text.to_i.between?(minimum, maximum)
        text.to_i
      end

      def self.valid_path?(path)
        path.is_a?(Array) && path.length.between?(1, 6) && path.all? { |part| part.is_a?(String) && Xml::NAME.match?(part) }
      end

      def self.validate_fields!(fields)
        unless fields.is_a?(Hash) && (fields.keys - ROW_FIELDS).empty? && fields.values.all? { |path| valid_path?(path) } && fields.values.uniq == fields.values
          raise Xml::Invalid, "invalid_observation_contract"
        end
      end

      def self.validate_report_contract!(contract)
        required = %i[reporting_data_path rows_path fields page_path pages_path]
        unless contract.is_a?(Hash) && (required - contract.keys).empty? && (contract.keys - required - [ :total_path ]).empty? &&
            contract.except(:fields).values.all? { |path| valid_path?(path) }
          raise Xml::Invalid, "report_wire_contract_required"
        end
        validate_fields!(contract[:fields])
        raise Xml::Invalid, "report_transaction_id_mapping_required" unless contract[:fields].key?(:raw_id)
      end

      private_class_method :envelope, :row, :rows_at, :count!, :valid_path?, :validate_fields!, :validate_report_contract!
    end
  end
end
