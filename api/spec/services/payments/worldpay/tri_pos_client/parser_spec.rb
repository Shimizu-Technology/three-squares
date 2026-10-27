# frozen_string_literal: true

require_relative "support"

RSpec.describe Payments::Worldpay::TriPosResponseParser, tripos_client: true do
  it "reads native nested processor facts and exact amounts without authorizing" do
    result = parse
    expect(result).to include(authorizing: false, financial_outcome: :unknown, complete: false)
    expect(result[:observations]).to include(approved_amount_cents: 29, total_amount_cents: 29, is_approved: true)
    expect(result.dig(:observations, :processor)).to eq(express_response_code: "0", host_response_code: "00")
    expect(result[:schema_gaps]).to eq(%w[referenceNumber capturedAmount transactionStatus transactionType])
    expect(result[:observations]).not_to have_key(:captured_amount_cents)
    expect(result).to be_frozen
    expect(result[:observations]).to be_frozen
  end

  it "sends synthetic fixture values through the actual wire parser" do
    expect(described_class.fixture.dig(:observations, :approved_amount_cents)).to eq(29)
    result = described_class.fixture(approvedAmount: Payments::Worldpay::Money::DecimalLexeme.new("1.230"))
    expect(result[:observations]).to be_empty
    expect(result[:ambiguity_hints]).to include("invalid_amount")
    expect(described_class.fixture(operation: :query)[:ambiguity_hints]).to include("empty_report_is_not_no_charge_proof")
  end

  %w[0.290 1.230 1e0 2.9e-1 -0.29 -0 -1 100000000.00].each do |token|
    it "rejects invalid numeric money lexeme #{token} without Float rounding" do
      data = sale_data(approvedAmount: Payments::Worldpay::Money::DecimalLexeme.new(token))
      result = parse(data)
      expect(result[:observations]).to be_empty
      expect(result[:authorizing]).to be(false)
    end
  end

  [ "0.29", nil, true, {}, [] ].each do |value|
    it "rejects nonnumeric schema amount #{value.class}" do
      expect(parse(sale_data(approvedAmount: value))[:observations]).to be_empty
    end
  end

  it "handles valid zero and upper application-bound money exactly" do
    expect(parse(sale_data(approvedAmount: 0)).dig(:observations, :approved_amount_cents)).to eq(0)
    value = Payments::Worldpay::Money::DecimalLexeme.new("99999999.99")
    expect(parse(sale_data(approvedAmount: value)).dig(:observations, :approved_amount_cents)).to eq(9_999_999_999)
  end

  it "never translates XX, host 00, isApproved or contradictory amounts into success" do
    result = parse(sale_data(_processor: { "expressResponseCode" => "XX", "hostResponseCode" => "00" }, isApproved: false))
    expect(result[:authorizing]).to be(false)
    expect(result[:financial_outcome]).to eq(:unknown)
    expect(result.dig(:observations, :processor, :express_response_code)).to eq("XX")
    expect(result[:ambiguity_hints]).to include("approval_amount_flag_conflict")
    expect(parse(sale_data(transactionStored: true))[:ambiguity_hints]).to include("offline_or_stored")
    expect(parse(sale_data(isApproved: "true"))[:ambiguity_hints]).to include("invalid_sale_flag")
  end

  it "records errors/count/conflicts without copying provider messages or raw data" do
    result = parse(sale_data(_hasErrors: false, _errors: [ { "exceptionMessage" => "secret-and-raw-wire", "errorType" => "XX" } ]))
    expect(result[:observations]).to include(has_errors: false, error_count: 1)
    expect(result[:ambiguity_hints]).to include("provider_errors", "inconsistent_error_envelope")
    expect(result.to_s).not_to include("secret-and-raw-wire", "exceptionMessage")
    expect(parse(sale_data(_errors: "XX"))[:ambiguity_hints]).to include("invalid_error_envelope")
    expect(parse(sale_data(_processor: nil))[:ambiguity_hints]).to include("invalid_processor")
  end

  it "projects only allowlisted EMV receipt tags, excluding PAN and track tags" do
    result = parse(sale_data(emv: {'tags' => [
      {'key' => '95', 'value' => '0000000000'}, {'key' => '9B', 'value' => 'E800'},
      {'key' => '5A', 'value' => '4111111111111111'}, {'key' => '57', 'value' => '4111111111111111'},
      {'key' => '9F26', 'value' => 'not-hex'}]}))
    expect(result.dig(:observations, :receipt, :emv)).to eq('95' => '0000000000', '9B' => 'E800')
    expect(result.to_s).not_to include('4111111111111111', 'not-hex')
  end

  it "drops noise, PAN, tracks, signature, raw processor response and EMV" do
    pan = "4111111111111111"
    data = sale_data(accountNumber: pan, cardLogo: "Visa", entryMode: "Contactless", approvalNumber: "synthetic-approval",
      signature: { "data" => "sensitive-signature" }, emv: { "cryptogram" => "raw-cryptogram", "tags" => [ { "9F26" => "raw-tag" } ] },
      _logs: [ "sensitive-log" ], trackData: "sensitive-track", unknownNoise: "XX")
    data["_processor"]["rawResponse"] = "sensitive-processor-response"
    result = parse(data)
    expect(result.dig(:observations, :receipt)).to eq(last4: "1111", card_logo: "Visa", entry_mode: "Contactless", approval_number: "synthetic-approval")
    expect(result.to_s).not_to include(pan, "sensitive", "raw-cryptogram", "raw-tag", "unknownNoise")
    expect(parse(sale_data(accountNumber: "XXXX XXXX XXXX 9876")).dig(:observations, :receipt, :last4)).to eq("9876")
    expect(parse(sale_data(accountNumber: "XXXX")).dig(:observations, :receipt)).to eq({})
    expect(parse(sale_data(accountNumber: "----"))[:observations]).to be_empty
    expect(parse(sale_data(accountNumber: ";#{pan}=999"))[:observations]).to be_empty
    # Opaque processor identifiers can be numeric; the schema's card-number
    # field is separately projected to last-four and never retained in full.
    expect(parse(sale_data(transactionId: '0000123456789012345')).dig(:observations, :transaction_id)).to eq('0000123456789012345')
  end

  it "rejects nonstring input, malformed roots, duplicate keys and invalid encodings" do
    [ {}, nil, 29, "", "[]", "null", "29", '"XX"', "{bad", '{"a":NaN}' ].each do |wire|
      result = described_class.call(wire, operation: :sale)
      expect(result[:observations]).to be_empty
      expect(result[:authorizing]).to be(false)
    end
    [ '{"a":1,"a":2}', '{"a":{"x":1,"x":2}}', '{"a":1,"\\u0061":2}' ].each do |wire|
      expect(described_class.call(wire, operation: :sale)[:ambiguity_hints]).to include("duplicate_key")
    end
    expect(described_class.call("\xff".b, operation: :sale)[:ambiguity_hints]).to include("invalid_encoding")
    expect(described_class.call("{}", operation: "sale")[:operation]).to eq(:unsupported)
  end

  it "enforces size, depth, node, object, array and string bounds even in noise" do
    expect(described_class.call(" " * (described_class::MAX_BYTES + 1), operation: :sale)[:ambiguity_hints]).to include("invalid_input")
    deep = "[" * 20 + "0" + "]" * 20
    expect(described_class.call(deep, operation: :sale)[:observations]).to be_empty
    expect(parse(sale_data(noise: Array.new(1001, 0)))[:ambiguity_hints]).to include("item_limit")
    expect(parse(sale_data(noise: (1..1001).to_h { |i| [ i.to_s, 0 ] }))[:ambiguity_hints]).to include("item_limit")
    expect(parse(sale_data(noise: "x" * 4097))[:ambiguity_hints]).to include("string_limit")
    expect(parse(sale_data(noise: Payments::Worldpay::Money::DecimalLexeme.new("1" * 5000)))[:ambiguity_hints]).to include("numeric_token_limit")
    expect(parse(sale_data("x" * 129 => 0))[:ambiguity_hints]).to include("invalid_key")
    many_nodes = Array.new(1000) { Array.new(66, 0) }
    expect(parse(sale_data(noise: many_nodes))[:ambiguity_hints]).to include("node_limit")
  end

  it "does not invoke JSON object additions" do
    data = sale_data(json_class: "SomeUntrustedConstant", data: 'quoted -0 and "123456789012345678901234567890123456789"')
    expect(parse(data).dig(:observations, :approved_amount_cents)).to eq(29)
  end

  it "fails closed when strict duplicate-key support is unavailable" do
    stub_const("Payments::Worldpay::TriPosResponseParser::STRICT_JSON_SUPPORTED", false)
    expect(parse[:ambiguity_hints]).to include("strict_json_version_required", "possible_financial_result")
    expect(described_class.new(:sale).inspect).to include("REDACTED")
  end

  it "reads exact native report casing and preserves missing currency/completeness" do
    result = described_class.call(query_wire([ report_row ]), operation: :query)
    expect(result[:malformed_rows]).to eq(0)
    row = result[:rows].first
    expect(row[:malformed]).to be(false)
    expect(row[:observations]).to include(account_id: "synthetic-account", account_id_value: "synthetic-account", host_response_code: "00",
      express_response_code: "XX", transaction_status: "SyntheticVendorState", transaction_amount_cents: 29)
    expect(row[:observations]).not_to have_key(:currency_code)
    expect(result[:schema_gaps]).to include("currency", "completeness")
    expect(result).to include(authorizing: false, complete: false, financial_outcome: :unknown)
  end

  it "keeps every malformed report position as possible financial ambiguity" do
    rows = [ report_row, nil, "XX", {}, report_row(transactionAmount: "0.29"),
      report_row(transactionAmount: Payments::Worldpay::Money::DecimalLexeme.new("1.230")),
      report_row(AccountId: { "Value" => "foreign-account" }), report_row(transactionId: []) ]
    result = described_class.call(query_wire(rows), operation: :query)
    expect(result[:rows].size).to eq(rows.size)
    expect(result[:malformed_rows]).to eq(7)
    expect(result[:rows].drop(1)).to all(include(malformed: true))
    expect(result[:rows].drop(1).map { |row| row[:ambiguity_hints] }).to all(include("possible_financial_result"))
    expect(result[:rows][3][:missing_fields]).to include("transactionId")
    expect(result[:ambiguity_hints]).to include("malformed_reporting_rows", "multiple_reporting_rows")
  end

  it "accepts at most 1000 query rows but never claims saturation is complete" do
    rows = Array.new(1000) { |index| report_row(transactionId: "transaction-#{index}") }
    result = described_class.call(query_wire(rows), operation: :query)
    expect(result[:rows].size).to eq(1000)
    expect(result[:malformed_rows]).to eq(0)
    expect(result[:ambiguity_hints]).to include("reporting_limit_reached", "report_completeness_unproven")
    expect(described_class.call(query_wire(rows + [ report_row ]), operation: :query)[:ambiguity_hints]).to include("item_limit")
    expect(described_class.call(query_wire([ report_row, report_row ]), operation: :query)[:ambiguity_hints]).to include("duplicate_transaction_ids")
    expect(parse({ "_hasErrors" => false, "_errors" => [], "reportingData" => {} }, operation: :query)[:ambiguity_hints]).to include("invalid_reporting_data")
  end

  it "does not accept sale evidence in pre-read cancellation" do
    result = parse(sale_data, operation: :pre_read_cancel)
    expect(result[:observations]).to eq(has_errors: false, error_count: 0)
    expect(result[:financial_operation]).to be(false)
    expect(result[:ambiguity_hints]).to include("pre_read_only_no_financial_evidence")
  end

  it "allowlists lane fields and marks status cached for up to 75 seconds" do
    data = { "laneId" => 12, "terminalId" => "synthetic-terminal", "rawDeviceInformation" => "raw-device",
      "quickChipEnabled" => true, "contactlessEmvEnabled" => true,
      "connectionStatus" => { "status" => "SyntheticVendorStatus", "timeStamp" => "2026-10-27T00:00:00Z" } }
    result = parse(data, operation: :lane)
    expect(result.dig(:observations, :connection)).to include(status: "SyntheticVendorStatus", cached: true, maximum_staleness_seconds: 75)
    expect(result.to_s).not_to include("quickChipEnabled", "contactlessEmvEnabled", "raw-device")
    expect(result[:authorizing]).to be(false)
    expect(parse({ "laneId" => 0 }, operation: :lane)[:ambiguity_hints]).to include("invalid_lane_id")
  end
end
