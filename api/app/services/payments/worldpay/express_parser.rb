# frozen_string_literal: true

require "nokogiri"
require_relative "money"

module Payments
  module Worldpay
    # Phase4a's scrubbed, representative XML shape, NOT a certified vendor schema.
    # A real adapter must reconcile its assigned contract before using this parser.
    # call accepts a wire String and returns symbol keys, string statuses, integer
    # cents (nil when untrusted), and allowlisted metadata; it never raises for bad
    # wire input. It does not bind a response to an application payment identity.
    class ExpressParser
      MAX_BYTES = 65_536
      MAX_DEPTH = 16
      MAX_NODES = 2_048
      MAX_ROWS = 100
      RESPONSE_FIELDS = %w[ExpressResponseCode HostResponseCode AVSResponseCode CVVResponseCode Transaction].freeze
      TRANSACTION_FIELDS = %w[TransactionID TransactionAmount ApprovedAmount CapturedAmount CurrencyCode ReferenceNumber TransactionStatus ApprovalNumber].freeze

      # Shared normalization of Express processor facts, also carried by the
      # representative triPOS response. Unknown/duplicate codes never grant capture.
      class Outcome
        OPERATIONS = %w[CreditCardSale CreditCardAuthorization CreditCardAuthorizationCompletion TransactionSetup TransactionQuery].freeze
        STATES = { "captured" => "Captured", "collecting" => "Pending", "failed" => "Declined",
                   "unknown" => "Unknown", "partial" => "PartiallyApproved", "cancelled" => "Cancelled" }.freeze
        DEFAULT_CODES = { "captured" => "0", "collecting" => "0", "failed" => "20",
                          "unknown" => "1001", "partial" => "5", "cancelled" => "0" }.freeze
        FAILURE_CODES = [ 7, 8, 20, 21, 24, 25, 101, 102, 103, 104, 105, 108, 120 ].freeze
        FRAUD_FAILURES = %w[N FAIL FAILED NO_MATCH].freeze

        def self.unknown(reason)
          { status: "unknown", raw_id: nil, requested_cents: nil, approved_cents: nil,
            captured_cents: nil, currency: nil, reference_number: nil,
            metadata: { representative: true, parse_error: reason, compensation_required: false } }
        end

        def self.scalar(value, required: false)
          return nil if value.nil? && !required
          unless value.is_a?(String) && value.bytesize.between?(1, 256) &&
                 value == value.strip && !value.match?(/[[:cntrl:]]/)
            raise Money::Invalid, "invalid_field"
          end
          value
        end

        def self.call(fields)
          code = scalar(fields[:code], required: true)
          raise Money::Invalid, "invalid_code" unless /\A[0-9]{1,4}\z/.match?(code)

          avs = scalar(fields[:avs])
          cvv = scalar(fields[:cvv])
          fraud_failed = [ avs, cvv ].any? { |value| FRAUD_FAILURES.include?(value&.upcase) }
          metadata = { representative: true, express_response_code: code, normalized_express_response_code: code.to_i,
                       host_response_code: scalar(fields[:host_code]), avs_response_code: avs, cvv_response_code: cvv,
                       approval_number: scalar(fields[:approval_number]),
                       fraud_failed: fraud_failed, compensation_required: false,
                       operation: fields[:operation], unknown_fields: fields.fetch(:unknown_fields, []) }
          result = { status: "unknown", raw_id: scalar(fields[:raw_id]), reference_number: scalar(fields[:reference_number]),
                     requested_cents: Money.parse(fields[:requested], currency: fields[:currency]),
                     approved_cents: Money.parse(fields[:approved], currency: fields[:currency], allow_zero: true),
                     captured_cents: Money.parse(fields[:captured], currency: fields[:currency], allow_zero: true),
                     currency: "USD", metadata: metadata }
          requested, approved, captured = result.values_at(:requested_cents, :approved_cents, :captured_cents)
          raise Money::Invalid, "inconsistent_amounts" unless captured <= approved && approved <= requested

          operation = fields[:operation]
          raise Money::Invalid, "unsupported_operation" unless OPERATIONS.include?(operation)

          # Setup/query success says nothing about the financial state of a sale.
          if %w[TransactionSetup TransactionQuery].include?(operation)
            raise Money::Invalid, "nonfinancial_approval" unless approved.zero? && captured.zero?
            result[:status] = "collecting" if code.to_i.zero? && fields[:state] == "Pending"
          elsif code.to_i == 5 && fields[:state] == "PartiallyApproved"
            require_approval!(result, fields)
            raise Money::Invalid, "invalid_partial" unless approved.positive? && approved < requested && [ 0, approved ].include?(captured)
            result[:status] = "partial"
          elsif code.to_i.zero? && fields[:state] == "Captured" &&
                %w[CreditCardSale CreditCardAuthorizationCompletion].include?(operation)
            require_approval!(result, fields)
            raise Money::Invalid, "incomplete_capture" unless approved == requested && captured == requested
            result[:status] = "captured"
          elsif code.to_i.zero? && fields[:state] == "Approved" && operation == "CreditCardAuthorization"
            require_approval!(result, fields)
            raise Money::Invalid, "invalid_authorization" unless approved == requested && captured.zero?
            result[:status] = "collecting"
          elsif approved.zero? && captured.zero?
            result[:status] = "failed" if FAILURE_CODES.include?(code.to_i) && %w[Declined Failed].include?(fields[:state])
            result[:status] = "cancelled" if code.to_i.zero? && fields[:state] == "Cancelled"
            result[:status] = "collecting" if code.to_i.zero? && fields[:state] == "Pending"
          end
          metadata[:compensation_required] = result[:status] == "partial" || (fraud_failed && approved.positive?)
          result
        rescue Money::Invalid => error
          unknown(error.message)
        end

        def self.require_approval!(result, fields)
          scalar(result[:raw_id], required: true)
          scalar(result[:reference_number], required: true)
          scalar(fields[:approval_number], required: true)
        end

        # Fixture amounts and field names are local conventions. Optional explicit
        # amounts/codes permit contradictory fixtures for fail-closed tests.
        def self.fixture_fields(raw_id:, amount_cents:, reference_number:, status:, code: nil,
                                approved_cents: nil, captured_cents: nil, currency: "USD",
                                operation: "CreditCardSale", approval_number: "SIM-APPROVED",
                                host_code: nil, avs_result: nil, cvv_result: nil)
          state = STATES.fetch(status.to_s) { raise ArgumentError, "unsupported fixture status" }
          Money.validate_cents(amount_cents)
          approved_cents ||= case status.to_s
          when "captured" then amount_cents
          when "partial" then amount_cents / 2
          else 0
          end
          captured_cents ||= %w[captured partial].include?(status.to_s) ? approved_cents : 0
          { raw_id: raw_id, requested: Money.format(amount_cents), approved: Money.format(approved_cents, allow_zero: true),
            captured: Money.format(captured_cents, allow_zero: true), reference_number: reference_number, currency: currency,
            code: (code || DEFAULT_CODES.fetch(status.to_s)).to_s, state: state, operation: operation,
            approval_number: approved_cents.positive? ? approval_number : nil,
            host_code: host_code, avs: avs_result, cvv: cvv_result }
        end
      end

      def self.call(xml)
        raise Money::Invalid, "invalid_input" unless xml.is_a?(String) && xml.bytesize.between?(1, MAX_BYTES)
        wire = xml.dup.force_encoding(Encoding::UTF_8)
        unless wire.valid_encoding? && !wire.include?("\0") && !wire.match?(/<!\s*(?:DOCTYPE|ENTITY)/i)
          raise Money::Invalid, "unsafe_xml"
        end

        # No recovery, entity substitution, DTD loading, XInclude, or HUGE mode.
        options = Nokogiri::XML::ParseOptions::STRICT | Nokogiri::XML::ParseOptions::NONET
        nodes = rows = 0
        Nokogiri::XML::Reader(wire, nil, "UTF-8", options).each do |node|
          raise Money::Invalid, "nesting_limit" if node.depth >= MAX_DEPTH
          next unless node.node_type == Nokogiri::XML::Reader::TYPE_ELEMENT
          nodes += 1
          rows += 1 if %w[Transaction Row].include?(node.name.split(":").last)
          raise Money::Invalid, "row_limit" if rows > MAX_ROWS
          raise Money::Invalid, "node_limit" if nodes > MAX_NODES
        end
        document = Nokogiri::XML::Document.parse(wire, nil, "UTF-8", options)
        raise Money::Invalid, "unsafe_xml" if document.internal_subset || document.external_subset
        root = document.root
        raise Money::Invalid, "invalid_root" unless root
        operation = root.name.delete_suffix("Response")
        raise Money::Invalid, "invalid_root" unless root.name == "#{operation}Response"
        namespace = root.namespace&.href
        document.traverse do |node|
          next unless node.element?
          raise Money::Invalid, "invalid_field" if node.name.bytesize > 256
          raise Money::Invalid, "mixed_namespaces" unless node.namespace&.href == namespace
          raise Money::Invalid, "row_limit" if node.element_children.length > MAX_ROWS
        end
        response = container(root, "Response")
        transaction = container(response, "Transaction")
        unknown_fields = (root.element_children.map(&:name) - [ "Response" ]).map { |name| "root/#{name}" } +
                         (response.element_children.map(&:name) - RESPONSE_FIELDS).map { |name| "Response/#{name}" } +
                         (transaction.element_children.map(&:name) - TRANSACTION_FIELDS).map { |name| "Transaction/#{name}" }
        Outcome.call(operation: operation, code: value(response, "ExpressResponseCode"), host_code: value(response, "HostResponseCode"),
                     avs: value(response, "AVSResponseCode"), cvv: value(response, "CVVResponseCode"),
                     raw_id: value(transaction, "TransactionID"), requested: value(transaction, "TransactionAmount"),
                     approved: value(transaction, "ApprovedAmount"), captured: value(transaction, "CapturedAmount"),
                     currency: value(transaction, "CurrencyCode"), reference_number: value(transaction, "ReferenceNumber"),
                     state: value(transaction, "TransactionStatus"), approval_number: value(transaction, "ApprovalNumber"),
                     unknown_fields: unknown_fields.sort)
      rescue Money::Invalid => error
        Outcome.unknown(error.message)
      rescue Nokogiri::XML::SyntaxError, ArgumentError
        Outcome.unknown("malformed_xml")
      end

      def self.container(node, name)
        matches = node.element_children.select { |child| child.name == name }
        raise Money::Invalid, "ambiguous_structure" unless matches.length == 1
        matches.first
      end

      def self.value(node, name)
        matches = node.element_children.select { |child| child.name == name }
        raise Money::Invalid, "ambiguous_field" if matches.length > 1
        field = matches.first
        return nil unless field
        raise Money::Invalid, "nested_field" unless field.element_children.empty?
        Outcome.scalar(field.text, required: true)
      end

      def self.fixture(**options)
        fields = Outcome.fixture_fields(**options)
        Nokogiri::XML::Builder.new(encoding: "UTF-8") do |xml|
          xml.public_send("#{fields[:operation]}Response") do
            xml.Response do
              { ExpressResponseCode: :code, HostResponseCode: :host_code, AVSResponseCode: :avs, CVVResponseCode: :cvv }.each do |tag, key|
                xml.public_send(tag, fields[key]) unless fields[key].nil?
              end
              xml.Transaction do
                { TransactionID: :raw_id, TransactionAmount: :requested, ApprovedAmount: :approved, CapturedAmount: :captured,
                  CurrencyCode: :currency, ReferenceNumber: :reference_number, TransactionStatus: :state, ApprovalNumber: :approval_number }.each do |tag, key|
                  xml.public_send(tag, fields[key]) unless fields[key].nil?
                end
              end
            end
          end
        end.to_xml
      end

      private_class_method :container, :value
    end
  end
end
