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
      ROW_FIELDS = %i[raw_id reference_number provider_status amount currency account_id acceptor_id terminal_id
        approval_number express_response_code transaction_type status_code].freeze
      SENSITIVE_FIELD = /(?:CardNumber|PAN|Expir|PaymentAccount|Token|Track|CVV|CVC|PIN|Cryptogram)/i
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

      # Published HPP recovery queries the exact server-stored setup ID (PDF
      # pp. 19-20, 66-67). Reaching the 1000-row cap cannot prove completeness.
      def self.query(xml, configuration:, contract:)
        financial_ambiguity = true
        validate_report_contract!(contract)
        root, response, code = envelope(xml, "TransactionQuery", configuration.namespace(:reporting), interface: :reporting)
        query_failed = !code.to_i.zero?
        data = Xml.at(response, contract[:reporting_data_path], required: !query_failed)
        # A recognized failed query with no transaction data is retryable. If
        # data exists, inspect it before rejecting the envelope so tainted rows
        # cannot hide behind a communication-error code.
        financial_ambiguity = !query_failed || (!data.nil? && (data.element_children.any? || !data.text.strip.empty?))
        raise Xml::Invalid, "report_query_not_successful" if query_failed && !financial_ambiguity
        path = contract[:rows_path]
        if data.element_children.empty? && !data.text.strip.empty?
          data = Xml.parse(data.text, interface: :reporting)
          path = contract[:embedded_roots][data.name]
          unless path && [ nil, configuration.namespace(:reporting) ].include?(data.namespace&.href)
            raise Xml::Invalid, "unexpected_report_structure"
          end
        end
        nodes = rows_at(data, path, strict: true)
        financial_ambiguity = nodes.any?
        raise Xml::Invalid, "report_row_limit" if nodes.length > MAX_ROWS
        rows = []
        nodes.each { |node| rows << row(node, contract[:fields], allow_empty: true) }
        unless rows.all? { |entry| entry[:raw_id] } && rows.map { |entry| entry[:raw_id] }.uniq.size == rows.size
          raise Xml::Invalid, "report_transaction_id_required"
        end
        raise Xml::Invalid, "report_query_not_successful" if query_failed
        result = { status: "unknown", complete: nodes.any? && nodes.size < MAX_ROWS, rows: rows,
          metadata: { contract_verified: false, express_response_code: code } }
        raise Xml::Invalid, "sensitive_response" if configuration.secrets_in?(result, allow_report_identifiers: true)
        result
      rescue Xml::Invalid, Money::Invalid => error
        # Retain only already-scrubbed observations, never raw XML. Even a
        # malformed later row cannot erase earlier possible financial evidence.
        safe_rows = (rows || []).reject { |entry| configuration.secrets_in?(entry, allow_report_identifiers: true) }
        { status: "unknown", complete: false, rows: safe_rows,
          metadata: { contract_verified: false, parse_error: error.message, financial_ambiguity: financial_ambiguity } }
      end

      # Generic counts are relative to Response. Published counts are relative
      # to every Item and require an exact requested page and fixed page size.
      # Embedded reporting XML is bounded separately and uses explicit roots.
      def self.call(xml, configuration:, contract:, requested_page: nil)
        validate_report_contract!(contract)
        if contract[:item_count_paths] && !(requested_page.is_a?(Integer) && requested_page.between?(1, MAX_PAGES))
          raise Xml::Invalid, "requested_report_page_required"
        end
        root, response, code = envelope(xml, "TransactionQueryPagination", configuration.namespace(:reporting), interface: :reporting)
        metadata = { contract_verified: false, express_response_code: code, normalized_express_response_code: code.to_i }
        raise Xml::Invalid, "report_query_not_successful" unless code.to_i.zero?
        data = Xml.at(response, contract[:reporting_data_path], required: true)
        rows_path = contract[:rows_path]
        if data.element_children.empty? && !data.text.strip.empty?
          # Some report contracts return escaped XML/CDATA. Parse that document
          # with the SAME bounds and security options, never entity expansion.
          data = Xml.parse(data.text, interface: :reporting)
          if contract[:item_count_paths]
            rows_path = contract[:embedded_roots][data.name]
            unless rows_path && [ nil, configuration.namespace(:reporting) ].include?(data.namespace&.href)
              raise Xml::Invalid, "unexpected_report_structure"
            end
          end
        end
        nodes = rows_at(data, rows_path, strict: !!contract[:item_count_paths])
        raise Xml::Invalid, "report_row_limit" if nodes.length > MAX_ROWS
        if contract[:item_count_paths]
          page, pages, total = item_counts!(nodes, contract)
        else
          page = count!(response, contract[:page_path], minimum: 1, maximum: MAX_PAGES)
          pages = count!(response, contract[:pages_path], minimum: 1, maximum: MAX_PAGES)
          total = count!(response, contract[:total_path], minimum: 0, maximum: MAX_PAGES * MAX_ROWS) if contract[:total_path]
        end
        raise Xml::Invalid, "invalid_report_page" if page > pages
        raise Xml::Invalid, "unexpected_report_page" if requested_page && requested_page != page
        rows = nodes.map { |node| row(node, contract[:fields], count_paths: contract.fetch(:item_count_paths, {}).values, allow_empty: !!contract[:item_count_paths]) }
        if contract[:item_count_paths]
          raise Xml::Invalid, "report_transaction_id_required" if rows.any? { |entry| !entry[:raw_id] }
          raise Xml::Invalid, "overlapping_row_conflict" unless rows.map { |entry| entry[:raw_id] }.uniq.length == rows.length
        end
        raise Xml::Invalid, "inconsistent_report_count" if total && total < rows.length
        metadata[:unknown_fields] = Xml.unknown_paths(root,
          [ [ "Response", "ExpressResponseCode" ], [ "Response" ] + contract[:reporting_data_path] ] +
          %i[page_path pages_path total_path].filter_map { |key| [ "Response" ] + contract[key] if contract[key] })
        metadata[:unknown_reporting_fields] = Xml.unknown_paths(data, [ rows_path ])
        result = { status: "unknown", complete: false, rows: rows, page: page, page_count: pages, total_count: total, metadata: metadata }
        raise Xml::Invalid, "sensitive_response" if configuration.secrets_in?(result, allow_report_identifiers: true)
        result
      rescue Xml::Invalid, Money::Invalid => error
        { status: "unknown", complete: false, rows: [], page: nil, page_count: nil, total_count: nil,
          metadata: { contract_verified: false, parse_error: error.message } }
      end

      def self.envelope(xml, method, namespace, interface: :transaction)
        root = Xml.parse(xml, interface: interface)
        raise Xml::Invalid, "unexpected_response_root" unless root.name == "#{method}Response" && root.namespace&.href == namespace
        response = Xml.child(root, "Response", required: true)
        [ root, response, Xml.code(response) ]
      end

      def self.row(node, fields, count_paths: [], allow_empty: false)
        facts = fields.to_h do |name, path|
          scalar = Xml.at(node, path)
          value = if allow_empty && scalar && scalar.element_children.empty? && scalar.text.empty?
            nil
          else
            Xml.text(scalar)
          end
          [ name, value ]
        end.compact
        amount = Money.parse(facts[:amount], currency: facts[:currency], allow_zero: true) if facts[:amount] && facts[:currency] == "USD"
        { status: "unknown", raw_id: facts[:raw_id], reference_number: facts[:reference_number], requested_cents: nil,
          approved_cents: nil, captured_cents: nil, currency: nil,
          metadata: { contract_verified: false, provider_status: facts[:provider_status], reported_amount: facts[:amount],
            reported_currency: facts[:currency], reported_amount_cents: amount,
            unknown_fields: Xml.unknown_paths(node, fields.values + count_paths) }.merge(
              facts.slice(:account_id, :acceptor_id, :terminal_id, :approval_number, :express_response_code, :transaction_type, :status_code)) }
      end

      def self.rows_at(node, path, strict: false)
        if strict
          path[0...-1].each do |name|
            unless node.element_children.length == 1 && node.element_children.first.name == name && node.children.select(&:text?).all? { |child| child.text.strip.empty? }
              raise Xml::Invalid, "unexpected_report_structure"
            end
            node = Xml.child(node, name, required: true)
          end
          raise Xml::Invalid, "unexpected_report_structure" unless node.children.select(&:text?).all? { |child| child.text.strip.empty? }
          raise Xml::Invalid, "unexpected_report_structure" if node.element_children.any? { |child| child.name != path.last }
          return node.element_children.to_a
        end
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

      def self.item_counts!(nodes, contract)
        raise Xml::Invalid, "report_count_proof_required" if nodes.empty?
        counts = nodes.map do |node|
          %i[page pages total].map do |key|
            count!(node, contract[:item_count_paths].fetch(key), minimum: 1, maximum: key == :total ? MAX_PAGES * MAX_ROWS : MAX_PAGES)
          end
        end
        raise Xml::Invalid, "inconsistent_report_count" unless counts.uniq.length == 1
        page, pages, total = counts.first
        size = contract[:fixed_page_size]
        unless page <= pages && pages == (total + size - 1) / size && nodes.length == [ size, total - (page - 1) * size ].min
          raise Xml::Invalid, "inconsistent_report_count"
        end
        counts.first
      end

      def self.valid_path?(path)
        path.is_a?(Array) && path.length.between?(1, 6) && path.all? { |part| part.is_a?(String) && Xml::NAME.match?(part) }
      end

      def self.validate_fields!(fields)
        unless fields.is_a?(Hash) && (fields.keys - ROW_FIELDS).empty? &&
            fields.values.all? { |path| valid_path?(path) && path.none? { |part| SENSITIVE_FIELD.match?(part) } } && fields.values.uniq == fields.values
          raise Xml::Invalid, "invalid_observation_contract"
        end
      end

      def self.validate_report_contract!(contract)
        if contract.is_a?(Hash) && contract.key?(:item_count_paths)
          required = %i[reporting_data_path rows_path fields item_count_paths fixed_page_size embedded_roots]
          counts = contract[:item_count_paths]
          roots = contract[:embedded_roots]
          unless contract.keys.length == required.length && (contract.keys - required).empty? && valid_path?(contract[:reporting_data_path]) && valid_path?(contract[:rows_path]) &&
              counts.is_a?(Hash) && counts.keys.length == 3 && (counts.keys - %i[page pages total]).empty? && counts.values.all? { |path| valid_path?(path) } && counts.values.uniq.length == 3 &&
              contract[:fixed_page_size] == MAX_ROWS && roots.is_a?(Hash) && !roots.empty? && roots.length <= 4 &&
              roots.all? { |name, path| name.is_a?(String) && Xml::NAME.match?(name) && valid_path?(path) }
            raise Xml::Invalid, "report_wire_contract_required"
          end
          validate_fields!(contract[:fields])
          raise Xml::Invalid, "report_transaction_id_mapping_required" unless contract[:fields].key?(:raw_id)
          return
        end
        required = %i[reporting_data_path rows_path fields page_path pages_path]
        unless contract.is_a?(Hash) && (required - contract.keys).empty? && (contract.keys - required - [ :total_path ]).empty? &&
            contract.except(:fields).values.all? { |path| valid_path?(path) }
          raise Xml::Invalid, "report_wire_contract_required"
        end
        validate_fields!(contract[:fields])
        raise Xml::Invalid, "report_transaction_id_mapping_required" unless contract[:fields].key?(:raw_id)
      end

      private_class_method :envelope, :row, :rows_at, :count!, :item_counts!, :valid_path?, :validate_fields!, :validate_report_contract!
    end
  end
end
