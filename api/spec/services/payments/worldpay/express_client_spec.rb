require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::ExpressClient do
  include_context "offline Worldpay client contracts"

  it "dispatches every financial method once to injected Transaction transport with exact frozen money and GUID" do
    described_class::FINANCIAL_METHODS.each do |name, method|
      calls = []
      transport = lambda do |**request|
        calls << request
        expect(request[:body]).to be_frozen
        envelope(method, "", code: "1001")
      end
      result = client(transport: transport).public_send(name, fields: transaction_fields, amount_cents: 2305, idempotency_key: WorldpayClientContractSupport::ID)
      expect(calls.length).to eq(1)
      expect(calls.first[:interface]).to eq(:transaction)
      expect(calls.first[:body]).to include("<#{method}", "<TransactionAmount>23.05</TransactionAmount>", "<IdempotencyKey>#{WorldpayClientContractSupport::ID}</IdempotencyKey>")
      expect(result).to include(status: "unknown", captured_cents: nil)
    end
  end

  it "exposes void, reversal, totals and close without choosing a recovery policy" do
    described_class::OTHER_METHODS.each do |name, method|
      transport = ->(**request) { expect(request[:interface]).to eq(:transaction); envelope(method, "") }
      args = { fields: transaction_fields, idempotency_key: WorldpayClientContractSupport::ID }
      args[:amount_cents] = 100 unless %w[BatchTotalsQuery BatchClose].include?(method)
      expect(client(transport: transport).public_send(name, **args)[:status]).to eq("unknown")
    end
  end

  it "rejects financial input before dispatch and never maps a browser handle" do
    transport = double("injected transport")
    expect(transport).not_to receive(:call)
    instance = client(transport: transport)
    expect { instance.credit_card_sale(fields: transaction_fields, amount_cents: 1.1, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Money::Invalid)
    expect { instance.credit_card_sale(fields: { "PaymentAccount" => { "OpaqueHandle" => "browser-handle" } }, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
  end

  it "gates all five Services seams on selected scheme and explicit consent, without transaction idempotency" do
    described_class::TOKEN_METHODS.each do |name, method|
      calls = []
      instance = client(transport: ->(**request) { calls << request; envelope(method, "", interface: :services) })
      [ [ "pass", false ], [ "omni_token", true ], [ nil, true ], [ "pass", "true" ] ].each do |scheme, consent|
        expect { instance.public_send(name, fields: {}, token_scheme: scheme, consent: consent) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
      end
      expect(calls).to be_empty
      result = instance.public_send(name, fields: { "PaymentAccount" => { "PaymentAccountID" => "fixture-retained-token" } }, token_scheme: "pass", consent: true)
      expect(calls.length).to eq(1)
      expect(calls.first[:interface]).to eq(:services)
      expect(calls.first[:body]).not_to include("IdempotencyKey")
      expect(result[:status]).to eq("unknown")
    end
  end

  it "uses the setup parser and preserves backend validation separately from the public collection URL" do
    instance = client(transport: ->(**) { setup_xml })
    result = instance.transaction_setup(fields: transaction_fields, amount_cents: 29, idempotency_key: WorldpayClientContractSupport::ID, presentation: "legacy")
    expect(result.status).to eq("ready")
    expect(result.to_h.keys).not_to include(:validation_code)
    expect(result.valid_return_code?("fixture-validation")).to be(true)
  end

  it "returns sanitized unknown outcomes on injected transport exceptions without retry" do
    calls = 0
    instance = client(transport: ->(**) { calls += 1; raise IOError, credentials["AccountToken"] })
    result = instance.credit_card_return(fields: transaction_fields, amount_cents: 29, idempotency_key: WorldpayClientContractSupport::ID)
    expect(calls).to eq(1)
    expect(result[:metadata][:parse_error]).to eq("transport_outcome_unknown")
    expect(result.inspect + instance.inspect).not_to include(*credentials.values)
  end

  it "requests complete pages, deduplicates overlapping rows by immutable account and transaction, and never infers paid" do
    calls = []
    responses = [ report_xml(page: 1, pages: 2, total: 2), report_xml(page: 2, pages: 2, total: 2, rows: report_row + report_row(id: "transaction-2")) ]
    instance = client(transport: ->(**request) { calls << request; responses.shift })
    result = instance.query_all(fields: { "Parameters" => { "ReferenceNumber" => "order-1" } })
    expect(result).to include(status: "unknown", complete: true, pages_read: 2)
    expect(result[:rows].map { |row| row[:raw_id] }).to eq(%w[transaction-1 transaction-2])
    expect(result[:rows].map { |row| row[:captured_cents] }).to eq([ nil, nil ])
    expect(calls.map { |request| request[:interface] }).to eq([ :reporting, :reporting ])
    expect(calls.last[:body]).to include("<PageNumber>2</PageNumber>", "<PageSize>1000</PageSize>")
    expect(calls.last[:body]).not_to include("IdempotencyKey")
  end

  it "stops at a caller page limit and never returns a complete checkpoint after partial enumeration" do
    calls = 0
    instance = client(transport: ->(**) { calls += 1; report_xml(page: calls, pages: 3, total: 1) })
    result = instance.query_all(fields: {}, max_pages: 2)
    expect(calls).to eq(2)
    expect(result).to include(complete: false, pages_read: 2)
    expect(result[:metadata][:parse_error]).to eq("report_page_limit")
  end

  it "enforces the absolute 1000-page bound with an injected empty report" do
    calls = 0
    instance = client(transport: ->(**) { calls += 1; report_xml(page: calls, pages: 1000, total: 0, rows: "") })
    expect(instance.query_all(fields: {})).to include(complete: true, pages_read: 1000, rows: [])
    expect(calls).to eq(1000)
    expect { instance.query_all(fields: {}, max_pages: 1001) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
  end

  it "fails closed on changing page counts, missing IDs, conflicting overlap and malformed later pages" do
    variants = [ report_xml(page: 2, pages: 3), report_xml(page: 2, pages: 2, rows: report_row.sub("<TransactionID>transaction-1</TransactionID>", "")),
      report_xml(page: 2, pages: 2, rows: report_row(state: "ChangedState")), "<broken" ]
    variants.each do |second|
      responses = [ report_xml(page: 1, pages: 2), second ]
      result = client(transport: ->(**) { responses.shift }).query_all(fields: {})
      expect(result[:complete]).to be(false)
      expect(result[:metadata][:parse_error]).not_to be_nil
    end
  end

  it "bounds aggregate rows and rejects pagination fields supplied by callers" do
    result = client(transport: ->(**) { report_xml(rows: report_row + report_row(id: "transaction-2"), total: 2) }).query_all(fields: {}, max_rows: 1)
    expect(result[:metadata][:parse_error]).to eq("report_aggregate_row_limit")
    transport = double("injected transport")
    expect(transport).not_to receive(:call)
    instance = client(transport: transport)
    [ 0, 1001, "1", 1.0 ].each do |number|
      expect { instance.transaction_query_pagination(fields: {}, page_number: number) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    end
    expect { instance.transaction_query_pagination(fields: { "Parameters" => { "PageNumber" => "9" } }, page_number: 1) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
  end

  it "rejects truncated total counts and pages larger than requested" do
    result = client(transport: ->(**) { report_xml(total: 2) }).query_all(fields: {})
    expect(result).to include(complete: false)
    expect(result[:metadata][:parse_error]).to eq("incomplete_report_total")
    result = client(transport: ->(**) { report_xml(total: 2, rows: report_row + report_row(id: "transaction-2")) }).query_all(fields: {}, page_size: 1)
    expect(result[:metadata][:parse_error]).to eq("report_page_size_limit")
  end
end
