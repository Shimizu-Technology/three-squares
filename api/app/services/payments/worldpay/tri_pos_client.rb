# frozen_string_literal: true

require_relative "tri_pos_configuration"
require_relative "tri_pos_response_parser"
require "date"

module Payments
  module Worldpay
    # Explicitly injected, offline-first native triPOS port. This class never
    # constructs a transport or writes payment state. Dispatch is always once.
    class TriPosClient
      class Invalid < ArgumentError; end
      MAX_REQUEST_BYTES = 65_536
      SALE_BOOLEAN_CONFIGURATION = %w[allowDebit allowPartialApprovals checkForDuplicateTransactions].freeze
      SALE_STRING_CONFIGURATION = %w[marketCode promptForSignature userInputTimeout isGiftSupported isManualEntryAllowed confirmOriginalAmount processUSMaestroDebitOffLinePinCvmAsDebit].freeze

      # Reviewable build-only request. Even a caller supplying a transport cannot
      # dispatch this via the client. Contains no credentials or PAN fields.
      class RequestPlan
        attr_reader :operation, :method, :path, :body, :blockers

        def initialize(operation:, path:, body:, method: :post, blocker: "assigned_mutation_contract_required")
          @operation, @method, @path, @body = operation, method, path.freeze, body.freeze
          @blockers = [ blocker ].freeze
          freeze
        end

        def dispatchable? = false
        def authorizing? = false
        def financial_outcome = :unknown

        def inspect
          "#<#{self.class.name} blocked [REDACTED]>"
        end
        alias_method :to_s, :inspect
      end

      def initialize(configuration:, transport:)
        unless configuration.is_a?(TriPosConfiguration) && transport.respond_to?(:call)
          raise Invalid, "explicit_tripos_configuration_and_transport_required"
        end
        @configuration, @transport = configuration, transport
        freeze
      end

      def sale(lane_id:, amount_cents:, reference:, configuration: {})
        body = { "laneId" => lane_id!(lane_id), "transactionAmount" => money!(amount_cents),
          "referenceNumber" => text!(reference), "configuration" => sale_configuration!(configuration) }
        dispatch(:sale, :post, "/api/v1/sale", body)
      end

      def query(reference:, terminal_id:, begin_time:, end_time:, transaction_id: nil)
        first, last = timestamp!(begin_time), timestamp!(end_time)
        raise Invalid, "invalid_tripos_query_window" if first > last
        body = { "referenceNumber" => text!(reference), "terminalId" => text!(terminal_id),
          "transactionDateTimeBegin" => first, "transactionDateTimeEnd" => last }
        body["transactionId"] = identifier!(transaction_id) unless transaction_id.nil?
        dispatch(:query, :post, "/api/v1/transactionQuery", body)
      end

      def pre_read_cancel(lane_id:)
        dispatch(:pre_read_cancel, :post, "/api/v1/cancel", { "laneId" => lane_id!(lane_id) })
      end

      def pair(lane_id:, terminal_id:, activation_code:, description: nil)
        body = { "laneId" => lane_id!(lane_id), "terminalId" => text!(terminal_id), "activationCode" => text!(activation_code) }
        body["description"] = text!(description) unless description.nil?
        dispatch(:pair, :post, "/cloudapi/v1/lanes", body, lane_api: true)
      end

      def lane(lane_id:)
        dispatch(:lane, :get, lane_path(lane_id), nil, lane_api: true)
      end

      def lane_status(lane_id:)
        dispatch(:lane_status, :get, "#{lane_path(lane_id)}/connectionstatus", nil, lane_api: true)
      end

      def update_lane(lane_id:, description:)
        # The requested description change is absent from Lane 5.0.4's PATCH
        # schema. Preserve the desired request as a BLOCKED plan; do not send an
        # undocumented field or translate it into unrelated device flags.
        RequestPlan.new(operation: :update_lane, method: :patch, path: lane_path(lane_id),
          body: encode!("description" => text!(description)), blocker: "description_update_contract_unverified")
      end

      def delete_lane(lane_id:)
        dispatch(:delete_lane, :delete, lane_path(lane_id), nil, lane_api: true)
      end

      # Mutation ports deliberately build only. No success, retry safety,
      # capability, allowed paymentType or reversal type is inferred here.
      def refund(lane_id:, amount_cents:, reference:)
        plan(:refund, "/api/v1/refund", "laneId" => lane_id!(lane_id),
          "transactionAmount" => money!(amount_cents), "referenceNumber" => text!(reference))
      end

      def linked_return(lane_id:, transaction_id:, payment_type:, amount_cents:, reference:)
        path = "/api/v1/return/#{identifier!(transaction_id)}/#{identifier!(payment_type)}"
        plan(:linked_return, path, "laneId" => lane_id!(lane_id),
          "transactionAmount" => numeric_money!(amount_cents), "referenceNumber" => text!(reference))
      end

      def void(lane_id:, transaction_id:, reference:)
        plan(:void, "/api/v1/void/#{identifier!(transaction_id)}", "laneId" => lane_id!(lane_id), "referenceNumber" => text!(reference))
      end

      def reversal(lane_id:, transaction_id:, payment_type:, amount_cents:, reference:, type:)
        path = "/api/v1/reversal/#{identifier!(transaction_id)}/#{identifier!(payment_type)}"
        plan(:reversal, path, "laneId" => lane_id!(lane_id), "transactionAmount" => numeric_money!(amount_cents),
          "referenceNumber" => text!(reference), "type" => identifier!(type))
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end
      alias_method :to_s, :inspect

      private

      def plan(operation, path, body)
        RequestPlan.new(operation: operation, path: path, body: encode!(body))
      end

      def dispatch(operation, method, path, body, lane_api: false)
        wire = body.nil? ? nil : encode!(body)
        request_id = SecureRandom.uuid
        headers = @configuration.headers(request_id: request_id, lane_api: lane_api)
        begin
          response = @transport.call(method: method, path: path.freeze, body: wire, headers: headers)
          return unknown(operation, "invalid_transport_response") unless response.is_a?(Hash)
          # Published successful status is 200, including create and delete.
          return unknown(operation, "http_outcome_unknown") unless response[:status].is_a?(Integer) && response[:status] == 200
          return unknown(operation, "invalid_response_headers") unless valid_headers?(response[:headers])
          unless lane_api
            echo = response[:headers].select { |key, _| key.downcase == "tp-request-id" }.values
            return unknown(operation, "request_id_echo_mismatch") unless echo == [ request_id ]
          end
          # DELETE publishes no response body. Empty success conveys transport
          # facts only; all other parser inputs remain bounded JSON Strings.
          facts = if operation == :delete_lane && response[:body] == ""
            TriPosResponseParser.unknown(operation: operation, reason: "delete_response_has_no_published_schema")
          else
            TriPosResponseParser.call(response[:body], operation: operation)
          end
          return unknown(operation, "credential_reflection") if @configuration.token_in?(facts)
          TriPosResponseParser.freeze_tree(facts.merge(http_status: 200, request_id: request_id,
            request_id_echo_verified: !lane_api))
        rescue StandardError
          # Provider/transport exceptions may contain credentials or wire bytes.
          # No exception messages/causes/raw payloads cross this port.
          unknown(operation, "transport_outcome_unknown")
        end
      end

      def unknown(operation, reason)
        TriPosResponseParser.unknown(operation: operation, reason: reason)
      end

      def valid_headers?(headers)
        headers.is_a?(Hash) && headers.size <= 64 && headers.all? do |key, value|
          key.is_a?(String) && /\A[A-Za-z0-9-]{1,128}\z/.match?(key) &&
            value.is_a?(String) && value.bytesize <= 4096 && value.valid_encoding? && !value.match?(/[[:cntrl:]]/)
        end
      end

      def encode!(body)
        wire = JSON.generate(body)
        raise Invalid, "tripos_request_size_limit" if wire.bytesize > MAX_REQUEST_BYTES
        wire.freeze
      end

      def lane_id!(value)
        raise Invalid, "invalid_tripos_lane_id" unless value.is_a?(Integer) && value.between?(1, 999_999)
        value
      end

      def lane_path(value)
        "/cloudapi/v1/lanes/#{lane_id!(value)}"
      end

      def text!(value)
        text = value.dup.force_encoding(Encoding::UTF_8) if value.is_a?(String)
        unless text && text.valid_encoding? && text.bytesize.between?(1, 256) && text == text.strip &&
            !text.match?(/[[:cntrl:]]/) && !text.match?(/(?:[0-9][ -]?){12,}/) && !text.match?(/[%^;=]/) && !@configuration.token_in?(text)
          raise Invalid, "invalid_tripos_request_field"
        end
        text
      end

      def identifier!(value)
        text = text!(value)
        raise Invalid, "invalid_tripos_path_identifier" unless /\A[A-Za-z0-9][A-Za-z0-9_-]{0,127}\z/.match?(text)
        text
      end

      def timestamp!(value)
        text = text!(value)
        unless /\A[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\z/.match?(text)
          raise Invalid, "invalid_tripos_query_timestamp"
        end
        parsed = DateTime.strptime(text, "%Y-%m-%d %H:%M:%S")
        raise Invalid, "invalid_tripos_query_timestamp" unless parsed.strftime("%Y-%m-%d %H:%M:%S") == text
        text
      rescue Date::Error
        raise Invalid, "invalid_tripos_query_timestamp", cause: nil
      end

      def money!(value)
        Money.format(value)
      rescue Money::Invalid
        raise Invalid, "invalid_tripos_amount", cause: nil
      end

      def numeric_money!(value)
        Money::DecimalLexeme.new(money!(value))
      end

      def sale_configuration!(value)
        raise Invalid, "invalid_tripos_sale_configuration" unless value.is_a?(Hash) && value.size <= 32
        value.to_h do |key, item|
          raise Invalid, "invalid_tripos_sale_configuration" unless key.is_a?(String)
          valid = if SALE_BOOLEAN_CONFIGURATION.include?(key)
            [ true, false ].include?(item)
          elsif SALE_STRING_CONFIGURATION.include?(key)
            item = text!(item)
            true
          elsif key == "cardReadRetries"
            item.is_a?(Integer) && item.between?(0, 10)
          elsif key == "allowedPaymentTypes"
            if item.is_a?(Array) && item.size.between?(1, 8)
              item = item.map { |entry| text!(entry) }
              true
            end
          end
          raise Invalid, "unsupported_tripos_sale_configuration" unless valid
          [ key, item ]
        end
      end
    end
  end
end
