require "spec_helper"
require_relative "../../../../app/services/payments/worldpay/express_client"
require_relative "../../../../app/services/payments/worldpay/express_transport"

# Entirely synthetic wire layouts. These are not Worldpay XSD fixtures.
module WorldpayClientContractSupport
  ID = "12345678-1234-1234-1234-123456789abc"
  Identity = Struct.new(:provider, :environment, :currency, :credential_reference, :external_account_id, keyword_init: true)

  def identity(**overrides)
    Identity.new(**{ provider: "worldpay", environment: "sandbox", currency: "USD", credential_reference: "worldpay_default", external_account_id: "fixture-account-id" }.merge(overrides))
  end

  def credentials
    { "AccountID" => "fixture-account-id", "AccountToken" => "fixture-account-token", "AcceptorID" => "fixture-acceptor-id",
      "ApplicationID" => "fixture-application-id", "ApplicationName" => "Fixture Application", "ApplicationVersion" => "fixture-version" }
  end

  def config_env
    { "APP_DEPLOYMENT_ENV" => "test", "WORLDPAY_MODE" => "sandbox",
      "WORLDPAY_EXPRESS_TRANSACTION_URL" => "https://certtransaction.elementexpress.com/",
      "WORLDPAY_EXPRESS_REPORTING_URL" => "https://certreporting.elementexpress.com/",
      "WORLDPAY_EXPRESS_SERVICES_URL" => "https://certservices.elementexpress.com/",
      "WORLDPAY_EXPRESS_HOSTED_BASE_URL" => "https://certtransaction.hostedpayments.com/",
      "WORLDPAY_RETURN_URL" => "https://checkout.example.test/payments/return?state=fixture",
      "WORLDPAY_TERMINAL_PROFILE_KEY" => "fixture-profile" }
  end

  def namespaces
    %i[transaction reporting services].to_h { |interface| [ interface, "urn:local:#{interface}" ] }
  end

  def profile
    { approved: true, key: "fixture-profile", fields: { "Terminal" => { "TerminalID" => "fixture-terminal", "CardPresentCode" => "fixture-approved-indicator" },
      "Transaction" => { "MarketCode" => "fixture-approved-market", "PartialApprovedFlag" => "fixture-approved-policy" } } }
  end

  def configuration(**overrides)
    Payments::Worldpay::Configuration.new(**{ identity: identity, terminal_profile: profile, namespaces: namespaces,
      return_origins: [ "https://checkout.example.test" ], premium_origins: [ "https://payments-test.worldpay.com" ],
      env: config_env, credentials: credentials, token_scheme: "pass" }.merge(overrides))
  end

  def wire_contract
    transaction_fields = { "Terminal" => %w[TerminalID CardPresentCode],
      "Transaction" => %w[MarketCode PartialApprovedFlag TransactionAmount ReferenceNumber TransactionID ReversalType TicketNumber],
      "PaymentAccount" => %w[PaymentAccountID] }
    methods = Payments::Worldpay::XmlBuilder::TRANSACTION_METHODS.to_h do |method|
      spec = { fields: transaction_fields.transform_values(&:dup), required_profile_paths: [ [ "Terminal", "TerminalID" ], [ "Terminal", "CardPresentCode" ],
        [ "Transaction", "MarketCode" ], [ "Transaction", "PartialApprovedFlag" ] ] }
      unless %w[BatchClose BatchTotalsQuery].include?(method)
        spec[:amount_path] = [ "Transaction", "TransactionAmount" ]
        spec[:required_paths] = [ [ "Transaction", "TransactionAmount" ], [ "Transaction", "ReferenceNumber" ] ]
      end
      if method == "TransactionSetup"
        spec[:fields]["TransactionSetup"] = %w[ReturnURL TransactionSetupMethod Embedded HPType CVVRequired AutoReturn]
        spec[:return_url_path] = [ "TransactionSetup", "ReturnURL" ]
      end
      [ method, spec ]
    end
    methods["TransactionQueryPagination"] = { fields: { "Parameters" => %w[PageNumber PageSize ReferenceNumber] } }
    Payments::Worldpay::XmlBuilder::SERVICES_METHODS.each do |method|
      methods[method] = { fields: { "PaymentAccount" => %w[PaymentAccountID TransactionID] } }
    end
    methods
  end

  def setup_contract
    { setup_id_path: %w[TransactionSetup TransactionSetupID], validation_code_path: %w[TransactionSetup ValidationCode] }
  end

  def row_contract
    { raw_id: [ "TransactionID" ], reference_number: [ "ReferenceNumber" ], provider_status: [ "TransactionStatus" ], amount: [ "TransactionAmount" ], currency: [ "CurrencyCode" ] }
  end

  def report_contract
    { reporting_data_path: [ "ReportingData" ], rows_path: %w[Transactions Transaction], fields: row_contract,
      page_path: [ "PageNumber" ], pages_path: [ "PageCount" ], total_path: [ "TotalCount" ] }
  end

  def client(transport:, **overrides)
    Payments::Worldpay::ExpressClient.new(**{ configuration: configuration, transport: transport, wire_contract: wire_contract,
      setup_contract: setup_contract, report_contract: report_contract,
      pagination_request: { page_number_path: %w[Parameters PageNumber], page_size_path: %w[Parameters PageSize] } }.merge(overrides))
  end

  def envelope(method, inner, interface: :transaction, code: "0")
    "<#{method}Response xmlns=\"#{namespaces[interface]}\"><Response><ExpressResponseCode>#{code}</ExpressResponseCode>#{inner}</Response></#{method}Response>"
  end

  def setup_xml(setup_id: ID, validation: "fixture-validation", extra: "", code: "0")
    envelope("TransactionSetup", "<TransactionSetup><TransactionSetupID>#{setup_id}</TransactionSetupID><ValidationCode>#{validation}</ValidationCode>#{extra}</TransactionSetup>", code: code)
  end

  def report_row(id: "transaction-1", state: "UnexpectedVendorState", amount: "0.29", extra: "")
    "<Transaction><TransactionID>#{id}</TransactionID><ReferenceNumber>order-1</ReferenceNumber><TransactionStatus>#{state}</TransactionStatus><TransactionAmount>#{amount}</TransactionAmount><CurrencyCode>USD</CurrencyCode>#{extra}</Transaction>"
  end

  def report_xml(page: 1, pages: 1, total: 1, rows: report_row, embedded: false)
    data = "<Transactions>#{rows}</Transactions>"
    data = "<![CDATA[<Report>#{data}</Report>]]>" if embedded
    envelope("TransactionQueryPagination", "<PageNumber>#{page}</PageNumber><PageCount>#{pages}</PageCount><TotalCount>#{total}</TotalCount><ReportingData>#{data}</ReportingData>", interface: :reporting)
  end

  def transaction_fields
    { "Transaction" => { "ReferenceNumber" => "order-1" } }
  end
end

RSpec.shared_context "offline Worldpay client contracts" do
  include WorldpayClientContractSupport

  before do
    # These specs must never invoke ExpressTransport#call or a real HTTP client.
    allow(Payments::Worldpay::ExpressTransport).to receive(:new).and_raise("real transport forbidden in unit tests")
    allow(Net::HTTP).to receive(:new).and_raise("network forbidden in unit tests")
  end
end
