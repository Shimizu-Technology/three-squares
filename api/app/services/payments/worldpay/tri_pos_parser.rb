# frozen_string_literal: true

require "json"
require_relative "express_parser"

module Payments
  module Worldpay
    # Representative Phase4a JSON, NOT a certified triPOS schema. Only wire Strings
    # are accepted, so decimal tokens and duplicate keys can be checked faithfully.
    # The normalized hash contract is identical to ExpressParser.call.
    class TriPosParser
      MAX_BYTES = ExpressParser::MAX_BYTES
      MAX_DEPTH = ExpressParser::MAX_DEPTH
      MAX_NODES = ExpressParser::MAX_NODES
      MAX_ROWS = ExpressParser::MAX_ROWS
      OPERATIONS = { "sale" => "CreditCardSale", "authorization" => "CreditCardAuthorization",
                     "completion" => "CreditCardAuthorizationCompletion", "setup" => "TransactionSetup", "query" => "TransactionQuery" }.freeze
      FIELDS = %w[transactionType expressResponseCode hostResponseCode avsResponseCode cvvResponseCode transactionId
                  transactionAmount approvedAmount capturedAmount currencyCode referenceNumber transactionStatus
                  approvalNumber isApproved isPartialApproval isCancelled _errors].freeze

      def self.call(json)
        raise Money::Invalid, "invalid_input" unless json.is_a?(String) && json.bytesize.between?(1, MAX_BYTES)
        wire = json.dup.force_encoding(Encoding::UTF_8)
        raise Money::Invalid, "invalid_encoding" unless wire.valid_encoding?
        data = JSON.parse(wire, decimal_class: Money::DecimalLexeme, allow_duplicate_key: false,
                          max_nesting: MAX_DEPTH, create_additions: false, allow_nan: false)
        validate_bounds!(data)
        raise Money::Invalid, "invalid_root" unless data.is_a?(Hash)
        operation = OPERATIONS.fetch(data["transactionType"]) { raise Money::Invalid, "unsupported_operation" }
        %w[isApproved isPartialApproval isCancelled].each do |key|
          raise Money::Invalid, "invalid_flags" unless [ true, false ].include?(data[key])
        end
        expected_approved = %w[Captured Approved PartiallyApproved].include?(data["transactionStatus"])
        unless data["isApproved"] == expected_approved &&
               data["isPartialApproval"] == (data["transactionStatus"] == "PartiallyApproved") &&
               data["isCancelled"] == (data["transactionStatus"] == "Cancelled")
          raise Money::Invalid, "inconsistent_flags"
        end
        errors = data.fetch("_errors", [])
        raise Money::Invalid, "tri_pos_errors" unless errors.is_a?(Array) && errors.empty?

        ExpressParser::Outcome.call(operation: operation, code: data["expressResponseCode"], host_code: data["hostResponseCode"],
                                    avs: data["avsResponseCode"], cvv: data["cvvResponseCode"], raw_id: data["transactionId"],
                                    requested: data["transactionAmount"], approved: data["approvedAmount"], captured: data["capturedAmount"],
                                    currency: data["currencyCode"], reference_number: data["referenceNumber"], state: data["transactionStatus"],
                                    approval_number: data["approvalNumber"], unknown_fields: (data.keys - FIELDS).sort)
      rescue Money::Invalid => error
        ExpressParser::Outcome.unknown(error.message)
      rescue JSON::ParserError => error
        ExpressParser::Outcome.unknown(error.message.start_with?("duplicate key ") ? "duplicate_key" : "malformed_json")
      rescue EncodingError, ArgumentError
        ExpressParser::Outcome.unknown("malformed_json")
      end

      def self.validate_bounds!(data)
        stack = [ data ]
        nodes = 0
        until stack.empty?
          item = stack.pop
          nodes += 1
          raise Money::Invalid, "node_limit" if nodes > MAX_NODES
          case item
          when Hash
            raise Money::Invalid, "row_limit" if item.length > MAX_ROWS
            item.each do |key, value|
              raise Money::Invalid, "invalid_field" if key.bytesize > 256
              stack << value
            end
          when Array
            raise Money::Invalid, "row_limit" if item.length > MAX_ROWS
            stack.concat(item)
          end
        end
      end

      # Exact numeric JSON amounts are emitted without Float conversion. Other
      # options match ExpressParser.fixture; operation uses triPOS-style labels.
      def self.fixture(operation: "sale", **options)
        fields = ExpressParser::Outcome.fixture_fields(**options, operation: OPERATIONS.fetch(operation))
        data = { transactionType: operation, expressResponseCode: fields[:code], hostResponseCode: fields[:host_code],
                 avsResponseCode: fields[:avs], cvvResponseCode: fields[:cvv], transactionId: fields[:raw_id],
                 transactionAmount: Money::DecimalLexeme.new(fields[:requested]), approvedAmount: Money::DecimalLexeme.new(fields[:approved]),
                 capturedAmount: Money::DecimalLexeme.new(fields[:captured]), currencyCode: fields[:currency], referenceNumber: fields[:reference_number],
                 transactionStatus: fields[:state], approvalNumber: fields[:approval_number],
                 isApproved: %w[Captured Approved PartiallyApproved].include?(fields[:state]),
                 isPartialApproval: fields[:state] == "PartiallyApproved", isCancelled: fields[:state] == "Cancelled", _errors: [] }
        JSON.generate(data)
      end

      private_class_method :validate_bounds!
    end
  end
end
