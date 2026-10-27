# frozen_string_literal: true

require_relative "configuration"

module Payments
  module Worldpay
    # Published XML names only. This is neither an assigned terminal profile nor
    # a complete payment instrument contract. No I/O or financial classification.
    module PublishedContract
      class Unsupported < Configuration::Invalid; end

      def self.deep_freeze(value)
        case value
        when Hash then value.each { |key, entry| deep_freeze(key); deep_freeze(entry) }
        when Array then value.each { |entry| deep_freeze(entry) }
        end
        value.freeze
      end
      private_class_method :deep_freeze

      CHECKED_ON = "2026-10-27"
      SOURCES = deep_freeze({
        interface_3_1_7: {
          url: "https://docs.worldpay.com/assets/pdf/ExpressInterfaceSpecification3.pdf",
          published_on: "2026-02-28", age_days_at_check: 241,
          sha256: "9c35a5590fc4e702911232b71fb0e1ec1e040f20f03a60c009e429153ff333c3"
        },
        sale_sample: {
          url: "https://github.com/ElementPS/Express.CSharp/blob/ad180f2dead0cf93efa29d139e51aa2b1bcce415/README.md",
          published_on: "2018-07-19", age_days_at_check: 3022
        },
        setup_sample: {
          url: "https://github.com/ElementPS/HostedPayments.CSharp/blob/2197ca44802ad3aa24bc6c13f0ec0c7473b38a91/README.md",
          published_on: "2018-07-19", age_days_at_check: 3022
        },
        query_sample: {
          url: "https://github.com/ElementPS/TransactionQuery.CSharp/blob/734635bbe67364a90613d6cad851836c73e1fd85/TransactionQuery.CSharp/Controllers/HomeController.cs",
          published_on: "2018-12-16", age_days_at_check: 2872
        }
      })

      # Namespace identifiers are environment-independent, not transport URLs.
      # A Services namespace was not verified; do not derive it from a hostname.
      NAMESPACES = deep_freeze({
        transaction: "https://transaction.elementexpress.com",
        reporting: "https://reporting.elementexpress.com"
      })

      # Names: sale/setup samples and Terminal class (PDF p. 95).
      # Requiring every listed indicator is an application precondition, not a
      # claim that the public sample supplies the merchant's required settings.
      TERMINAL_FIELDS = deep_freeze(%w[TerminalID LaneNumber CardholderPresentCode CardInputCode TerminalCapabilityCode TerminalEnvironmentCode CardPresentCode MotoECICode CVVPresenceCode TerminalType])
      TRANSACTION_FIELDS = deep_freeze(%w[TransactionAmount ReferenceNumber TicketNumber MarketCode PartialApprovedFlag])
      REQUIRED_PROFILE_PATHS = deep_freeze(TERMINAL_FIELDS.map { |name| [ "Terminal", name ] } +
        [ [ "Transaction", "MarketCode" ], [ "Transaction", "PartialApprovedFlag" ] ])
      REQUIRED_TRANSACTION_PATHS = deep_freeze(%w[TransactionAmount ReferenceNumber TicketNumber].map { |name| [ "Transaction", name ] })

      # A deliberately small subset of each method's published fields. The
      # Transaction class and method tables permit other optional fields, but
      # they are not silently added here. PartialApprovedFlag is required by this
      # application profile even on methods where the method table is optional.
      WIRE_CONTRACT = deep_freeze({
        "CreditCardSale" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => TRANSACTION_FIELDS },
          required_paths: REQUIRED_TRANSACTION_PATHS, required_profile_paths: REQUIRED_PROFILE_PATHS,
          amount_path: %w[Transaction TransactionAmount]
        },
        "CreditCardAuthorization" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => TRANSACTION_FIELDS },
          required_paths: REQUIRED_TRANSACTION_PATHS, required_profile_paths: REQUIRED_PROFILE_PATHS,
          amount_path: %w[Transaction TransactionAmount]
        },
        "CreditCardAuthorizationCompletion" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => [ "TransactionID" ] + TRANSACTION_FIELDS },
          required_paths: [ %w[Transaction TransactionID] ] + REQUIRED_TRANSACTION_PATHS,
          required_profile_paths: REQUIRED_PROFILE_PATHS, amount_path: %w[Transaction TransactionAmount]
        },
        "CreditCardReturn" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => [ "TransactionID" ] + TRANSACTION_FIELDS },
          required_paths: [ %w[Transaction TransactionID] ] + REQUIRED_TRANSACTION_PATHS,
          required_profile_paths: REQUIRED_PROFILE_PATHS, amount_path: %w[Transaction TransactionAmount]
        },
        "CreditCardVoid" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => [ "TransactionID" ] + TRANSACTION_FIELDS },
          required_paths: [ %w[Transaction TransactionID] ] + REQUIRED_TRANSACTION_PATHS,
          required_profile_paths: REQUIRED_PROFILE_PATHS, amount_path: %w[Transaction TransactionAmount]
        },
        # Known-ID Full/Partial layout only (PDF pp. 46-47). The parent must
        # validate assigned ReversalType values; System/no-ID is unsupported.
        "CreditCardReversal" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => %w[ReversalType TransactionID] + TRANSACTION_FIELDS },
          required_paths: [ %w[Transaction ReversalType], %w[Transaction TransactionID] ] + REQUIRED_TRANSACTION_PATHS,
          required_profile_paths: REQUIRED_PROFILE_PATHS, amount_path: %w[Transaction TransactionAmount]
        },
        "TransactionSetup" => {
          fields: { "Terminal" => TERMINAL_FIELDS, "Transaction" => TRANSACTION_FIELDS,
            "TransactionSetup" => %w[TransactionSetupMethod Embedded CVVRequired AutoReturn ReturnURL] },
          required_paths: REQUIRED_TRANSACTION_PATHS + %w[TransactionSetupMethod Embedded CVVRequired AutoReturn ReturnURL].map { |name| [ "TransactionSetup", name ] },
          required_profile_paths: REQUIRED_PROFILE_PATHS, amount_path: %w[Transaction TransactionAmount],
          return_url_path: %w[TransactionSetup ReturnURL]
        },
        # Request layout only. The existing report/page-size ports cannot consume
        # the published response. See UNSUPPORTED and REPORTING_LAYOUT.
        "TransactionQuery" => {
          fields: { "Parameters" => %w[TransactionSetupID] },
          required_paths: [ %w[Parameters TransactionSetupID] ]
        },
        "TransactionQueryPagination" => {
          fields: { "Parameters" => %w[TransactionDateTimeBegin TransactionDateTimeEnd PageNumber ReferenceNumber TransactionStatusCode TransactionType LaneNumber ReverseOrder] },
          required_paths: %w[TransactionDateTimeBegin TransactionDateTimeEnd PageNumber].map { |name| [ "Parameters", name ] }
        }
      })

      # Relative to Response. Choose the paired TransactionSetup fields rather
      # than searching across the three copies of TransactionSetupID.
      SETUP_CONTRACT = deep_freeze({
        setup_id_path: %w[TransactionSetup TransactionSetupID],
        validation_code_path: %w[TransactionSetup ValidationCode]
      })

      OBSERVATION_CONTRACTS = deep_freeze({
        "CreditCardSale" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus], amount: %w[Transaction ApprovedAmount] },
        "CreditCardAuthorization" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus], amount: %w[Transaction ApprovedAmount] },
        "CreditCardAuthorizationCompletion" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus] },
        "CreditCardReturn" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus] },
        "CreditCardVoid" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus] },
        "CreditCardReversal" => { raw_id: %w[Transaction TransactionID], reference_number: %w[Transaction ReferenceNumber],
          provider_status: %w[Transaction TransactionStatus], amount: %w[Transaction ApprovedAmount] }
      })

      # Evidence for a future port, intentionally NOT an ExpressReportParser
      # contract. Count paths are relative to EACH Item; other paths follow the
      # existing parser's Response/ReportingData/row conventions.
      REPORTING_LAYOUT = deep_freeze({
        reporting_data_path: [ "ReportingData" ], rows_path: %w[Items Item],
        fields: { raw_id: [ "TransactionID" ], reference_number: [ "ReferenceNumber" ],
          provider_status: [ "TransactionStatus" ], amount: [ "TransactionAmount" ] },
        item_count_paths: { page: [ "CurrentPageNumber" ], pages: [ "MaxPageCount" ], total: [ "MaxRows" ] },
        page_number_path: %w[Parameters PageNumber], fixed_page_size: 1000
      })

      UNSUPPORTED = deep_freeze({
        services_namespace: "services_namespace_not_verified",
        instrument: "hosted_fields_handle_and_selected_token_contract_unavailable",
        system_reversal: "no_pan_system_reversal_contract_unavailable",
        premium_setup: "premium_setup_url_contract_not_mapped",
        observation_currency: "transaction_currency_response_path_not_verified",
        completion_return_void_amount: "method_output_tables_do_not_establish_amount_path",
        reporting_currency: "reporting_currency_path_not_verified",
        terminal_profile: "assigned_terminal_settings_required_no_numeric_defaults"
      })

      def self.namespaces = NAMESPACES
      def self.wire_contract = WIRE_CONTRACT
      def self.observation_contracts = OBSERVATION_CONTRACTS
      def self.reporting_layout = REPORTING_LAYOUT
      def self.unsupported = UNSUPPORTED

      def self.namespace(interface)
        NAMESPACES.fetch(interface) { raise Unsupported, "published_namespace_unsupported" }
      end

      def self.request_contract(method)
        WIRE_CONTRACT.fetch(method) { raise Unsupported, "published_method_unsupported" }
      end

      def self.setup_contract(presentation: "legacy")
        raise Unsupported, UNSUPPORTED.fetch(:premium_setup) unless presentation == "legacy"
        SETUP_CONTRACT
      end

      def self.report_contract
        deep_freeze(REPORTING_LAYOUT.slice(:reporting_data_path, :rows_path, :item_count_paths, :fixed_page_size).merge(
          fields: REPORTING_LAYOUT.fetch(:fields).merge(
            account_id: [ "AccountID" ], acceptor_id: [ "AcceptorID" ], terminal_id: [ "TerminalID" ],
            approval_number: [ "ApprovalNumber" ], express_response_code: [ "ExpressResponseCode" ],
            transaction_type: [ "TransactionType" ], status_code: [ "TransactionStatusCode" ]),
          embedded_roots: { "ReportingData" => %w[Items Item], "Items" => [ "Item" ] }))
      end

      def self.pagination_request
        deep_freeze(REPORTING_LAYOUT.slice(:page_number_path, :fixed_page_size))
      end
    end
  end
end
