require_relative "client_contract_support"
require_relative "../../../../app/services/payments/worldpay/published_contract"

RSpec.describe Payments::Worldpay::PublishedContract do
  include_context "offline Worldpay client contracts"

  def published_configuration(terminal_profile: published_profile)
    # Services is a synthetic test-only identifier, never a published default.
    configuration(namespaces: namespaces.merge(described_class.namespaces), terminal_profile: terminal_profile)
  end

  def published_profile
    terminal_names = %w[TerminalID LaneNumber CardholderPresentCode CardInputCode TerminalCapabilityCode TerminalEnvironmentCode CardPresentCode MotoECICode CVVPresenceCode TerminalType]
    { approved: true, key: "fixture-profile", fields: {
      "Terminal" => terminal_names.to_h { |name| [ name, "fixture-assigned-#{name}" ] },
      "Transaction" => { "MarketCode" => "fixture-assigned-market", "PartialApprovedFlag" => "fixture-assigned-policy" }
    } }
  end

  def published_builder(config: published_configuration)
    Payments::Worldpay::XmlBuilder.new(configuration: config, contract: described_class.wire_contract)
  end

  def required_fields(method)
    result = { "Transaction" => { "ReferenceNumber" => "fixture-reference", "TicketNumber" => "fixture-ticket" } }
    if %w[CreditCardAuthorizationCompletion CreditCardReturn CreditCardVoid CreditCardReversal].include?(method)
      result["Transaction"]["TransactionID"] = "fixture-original-transaction"
    end
    result["Transaction"]["ReversalType"] = "fixture-assigned-full-reversal" if method == "CreditCardReversal"
    if method == "TransactionSetup"
      result["TransactionSetup"] = { "TransactionSetupMethod" => "fixture-assigned-sale-method", "Embedded" => "fixture-assigned-embedded",
        "CVVRequired" => "fixture-assigned-cvv-policy", "AutoReturn" => "fixture-assigned-return-policy" }
    end
    result
  end

  def published_response(method, content, code: "0")
    "<#{method}Response xmlns=\"https://transaction.elementexpress.com\"><Response><ExpressResponseCode>#{code}</ExpressResponseCode>#{content}</Response></#{method}Response>"
  end

  it "publishes only verified namespace identifiers without environment URL rewriting" do
    expect(described_class.namespaces).to eq(transaction: "https://transaction.elementexpress.com", reporting: "https://reporting.elementexpress.com")
    expect(described_class.namespace(:transaction)).to eq(published_configuration.namespace(:transaction))
    expect { described_class.namespace(:services) }.to raise_error(described_class::Unsupported, "published_namespace_unsupported")
    expect { described_class.namespace(:unknown) }.to raise_error(described_class::Unsupported)
  end

  it "keeps public evidence dated and pinned without claiming assignment or certification" do
    expect(described_class::CHECKED_ON).to eq("2026-10-27")
    expect(described_class::SOURCES[:interface_3_1_7]).to include(published_on: "2026-02-28", age_days_at_check: 241)
    expect(described_class::SOURCES[:sale_sample][:url]).to include("ad180f2dead0cf93efa29d139e51aa2b1bcce415/README.md")
    expect(described_class.unsupported.values).to include("assigned_terminal_settings_required_no_numeric_defaults", "hosted_fields_handle_and_selected_token_contract_unavailable")
  end

  it "deep freezes every exported map, path, source and string" do
    frozen_tree = lambda do |value|
      expect(value).to be_frozen
      case value
      when Hash then value.each { |key, entry| frozen_tree.call(key); frozen_tree.call(entry) }
      when Array then value.each { |entry| frozen_tree.call(entry) }
      end
    end
    [ described_class.wire_contract, described_class.observation_contracts, described_class.setup_contract,
      described_class.namespaces, described_class.reporting_layout, described_class.unsupported, described_class::SOURCES ].each { |value| frozen_tree.call(value) }
    expect { described_class.wire_contract["CreditCardSale"][:amount_path] << "Injected" }.to raise_error(FrozenError)
  end

  %w[CreditCardSale CreditCardAuthorization CreditCardAuthorizationCompletion CreditCardReturn CreditCardVoid CreditCardReversal TransactionSetup].each do |method|
    it "feeds the existing XmlBuilder the bounded #{method} request layout" do
      xml = published_builder.build(method: method, fields: required_fields(method), amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
      root = Nokogiri::XML(xml).root
      expect(root.name).to eq(method)
      expect(root.namespace.href).to eq("https://transaction.elementexpress.com")
      expect(root.at_xpath("./*[local-name()='Transaction']/*[local-name()='TransactionAmount']").text).to eq("23.05")
      expect(root.at_xpath("./*[local-name()='IdempotencyKey']").text).to eq(WorldpayClientContractSupport::ID)
      expect(root.element_children.map(&:name)).to eq(%w[Credentials Application IdempotencyKey] + described_class.request_contract(method)[:fields].keys)
      expect(xml).to include("fixture-assigned-market", "fixture-assigned-policy", "fixture-assigned-LaneNumber")
      expect(xml).not_to include("<Card>", "<PaymentAccount>", "OpaqueHandle", "HostedFields")
    end
  end

  it "requires each assigned profile field and never obtains it from caller fields or numeric defaults" do
    described_class::REQUIRED_PROFILE_PATHS.each do |section, name|
      incomplete = published_profile
      incomplete[:fields][section].delete(name)
      # Caller-supplied values cannot satisfy an absent approved profile field.
      fields = required_fields("CreditCardSale")
      fields[section] ||= {}
      fields[section][name] = "fixture-caller-value"
      expect do
        published_builder(config: published_configuration(terminal_profile: incomplete)).build(method: "CreditCardSale", fields: fields, amount_cents: 2305,
          idempotency_key: WorldpayClientContractSupport::ID)
      end.to raise_error(Payments::Worldpay::Configuration::Invalid, "terminal_profile_incomplete")
    end
    conflict = required_fields("CreditCardSale")
    conflict["Terminal"] = { "TerminalID" => "caller-terminal" }
    expect do
      published_builder.build(method: "CreditCardSale", fields: conflict, amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
    end.to raise_error(Payments::Worldpay::Configuration::Invalid, "protected_wire_field_conflict")
  end

  it "requires linked IDs for completion, return, void and the bounded reversal layout" do
    %w[CreditCardAuthorizationCompletion CreditCardReturn CreditCardVoid CreditCardReversal].each do |method|
      fields = required_fields(method)
      fields["Transaction"].delete("TransactionID")
      expect do
        published_builder.build(method: method, fields: fields, amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
      end.to raise_error(Payments::Worldpay::Configuration::Invalid, "required_wire_field_missing")
    end
    expect(described_class.unsupported[:system_reversal]).to eq("no_pan_system_reversal_contract_unavailable")
  end

  it "rejects raw card, opaque handle, token and invented fields before a transport call" do
    transport = double("injected offline transport")
    expect(transport).not_to receive(:call)
    client = Payments::Worldpay::ExpressClient.new(configuration: published_configuration, transport: transport, wire_contract: described_class.wire_contract)
    [ { "Card" => { "CardNumber" => "forbidden" } }, { "Transaction" => { "OpaqueHandle" => "forbidden" } },
      { "PaymentAccount" => { "PaymentAccountID" => "forbidden" } }, { "Transaction" => { "InventedField" => "forbidden" } } ].each do |extra|
      fields = required_fields("CreditCardSale")
      extra.each { |section, entries| fields[section] = (fields[section] || {}).merge(entries) }
      expect do
        client.credit_card_sale(fields: fields, amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
      end.to raise_error(Payments::Worldpay::Configuration::Invalid, "wire_field_not_allowed")
    end
    expect { described_class.request_contract("PaymentAccountCreate") }.to raise_error(described_class::Unsupported, "published_method_unsupported")
  end

  it "uses the server return URL and parses the paired legacy setup fields without financial approval" do
    response = published_response("TransactionSetup", "<Transaction><TransactionSetupID>unrelated-copy</TransactionSetupID></Transaction><TransactionSetup><TransactionSetupID>#{WorldpayClientContractSupport::ID}</TransactionSetupID><ValidationCode>fixture-validation</ValidationCode></TransactionSetup>")
    transport = double("injected offline transport")
    expect(transport).to receive(:call).with(interface: :transaction, body: include("<ReturnURL>https://checkout.example.test/payments/return?state=fixture</ReturnURL>")).and_return(response)
    client = Payments::Worldpay::ExpressClient.new(configuration: published_configuration, transport: transport, wire_contract: described_class.wire_contract,
      setup_contract: described_class.setup_contract)
    result = client.transaction_setup(fields: required_fields("TransactionSetup"), amount_cents: 2305,
      idempotency_key: WorldpayClientContractSupport::ID, presentation: "legacy")
    expect(result.status).to eq("ready")
    expect(result.setup_id).to eq(WorldpayClientContractSupport::ID)
    expect(result.valid_return_code?("fixture-validation")).to be(true)
    expect(result.metadata[:contract_verified]).to be(false)
    expect(result.to_h.inspect).not_to include("fixture-validation", "captured", "approved_cents")
    expect { described_class.setup_contract(presentation: "premium") }.to raise_error(described_class::Unsupported, "premium_setup_url_contract_not_mapped")
  end

  it "does not infer legacy setup paths from hints, other copies or a premium URL" do
    [ "<Transaction><TransactionSetupID>#{WorldpayClientContractSupport::ID}</TransactionSetupID></Transaction>",
      "<TransactionSetup><TransactionSetupID>https://payments-test.worldpay.com/fixture</TransactionSetupID><ValidationCode>fixture-validation</ValidationCode></TransactionSetup>",
      "<TransactionSetup><TransactionSetupID>#{WorldpayClientContractSupport::ID}</TransactionSetupID></TransactionSetup>" ].each do |content|
      result = Payments::Worldpay::HppSetup.parse(published_response("TransactionSetup", content), configuration: published_configuration,
        presentation: "legacy", contract: described_class.setup_contract)
      expect(result.status).to eq("unknown")
      expect(result.setup_id).to be_nil
    end
  end

  it "retains only published observations, leaving every financial outcome and amount unknown" do
    described_class.observation_contracts.each do |method, contract|
      content = "<Transaction><TransactionID>fixture-result</TransactionID><ReferenceNumber>fixture-reference</ReferenceNumber><TransactionStatus>Approved</TransactionStatus><ApprovedAmount>23.05</ApprovedAmount><TransactionAmount>99.00</TransactionAmount><CurrencyCode>USD</CurrencyCode></Transaction>"
      transport = double("injected offline transport")
      expect(transport).to receive(:call).with(interface: :transaction, body: kind_of(String)).and_return(published_response(method, content))
      client = Payments::Worldpay::ExpressClient.new(configuration: published_configuration, transport: transport,
        wire_contract: described_class.wire_contract, observation_contracts: described_class.observation_contracts)
      operation = Payments::Worldpay::ExpressClient::FINANCIAL_METHODS.merge(Payments::Worldpay::ExpressClient::OTHER_METHODS).key(method)
      result = client.public_send(operation, fields: required_fields(method), amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
      expect(result).to include(status: "unknown", raw_id: "fixture-result", reference_number: "fixture-reference", requested_cents: nil,
        approved_cents: nil, captured_cents: nil, currency: nil)
      expect(result[:metadata]).to include(contract_verified: false, express_response_code: "0", provider_status: "Approved",
        reported_currency: nil, reported_amount_cents: nil, reported_amount: contract.key?(:amount) ? "23.05" : nil)
      expect(result[:metadata][:unknown_fields]).to include("Response/Transaction/TransactionAmount", "Response/Transaction/CurrencyCode")
    end
  end

  it "does not upgrade partial, duplicate or communication responses into financial truth" do
    %w[5 22 23 1001 1002].each do |code|
      result = Payments::Worldpay::ExpressReportParser.observe(published_response("CreditCardSale", "<Transaction><TransactionID>fixture-id</TransactionID><TransactionStatus>Approved</TransactionStatus><ApprovedAmount>23.05</ApprovedAmount></Transaction>", code: code),
        configuration: published_configuration, method: "CreditCardSale", contract: described_class.observation_contracts.fetch("CreditCardSale"))
      expect(result).to include(status: "unknown", captured_cents: nil, approved_cents: nil)
      expect(result[:metadata]).to include(express_response_code: code, contract_verified: false)
    end
  end

  it "publishes the pagination request names without inventing PageSize or response-level counts" do
    fields = { "Parameters" => { "TransactionDateTimeBegin" => "2026-10-26 00:00:00", "TransactionDateTimeEnd" => "2026-10-27 00:00:00", "PageNumber" => "1" } }
    xml = published_builder.build(method: "TransactionQueryPagination", fields: fields)
    expect(Nokogiri::XML(xml).root.namespace.href).to eq("https://reporting.elementexpress.com")
    expect(xml).to include("<PageNumber>1</PageNumber>")
    expect(xml).not_to include("PageSize", "IdempotencyKey", "<Terminal>")
    expect(described_class.reporting_layout).to include(rows_path: %w[Items Item], fixed_page_size: 1000,
      item_count_paths: { page: [ "CurrentPageNumber" ], pages: [ "MaxPageCount" ], total: [ "MaxRows" ] })
    expect { described_class.report_contract }.to raise_error(described_class::Unsupported, "per_item_counts_not_supported_by_existing_report_parser")
    expect { described_class.pagination_request }.to raise_error(described_class::Unsupported, "published_fixed_page_size_has_no_page_size_request_path")
    expect do
      published_builder.build(method: "TransactionQueryPagination", fields: { "Parameters" => fields["Parameters"].merge("PageSize" => "1000") })
    end.to raise_error(Payments::Worldpay::Configuration::Invalid, "wire_field_not_allowed")
  end

  it "fails closed before dispatch when the existing pagination port lacks a published compatible contract" do
    transport = double("injected offline transport")
    expect(transport).not_to receive(:call)
    client = Payments::Worldpay::ExpressClient.new(configuration: published_configuration, transport: transport, wire_contract: described_class.wire_contract)
    expect do
      client.transaction_query_pagination(fields: {}, page_number: 1)
    end.to raise_error(Payments::Worldpay::Configuration::Invalid, "pagination_contract_and_bounds_required")
    result = Payments::Worldpay::ExpressReportParser.call("unused", configuration: published_configuration, contract: described_class.reporting_layout)
    expect(result).to include(status: "unknown", complete: false, rows: [])
    expect(result[:metadata][:parse_error]).to eq("report_wire_contract_required")
  end
end
