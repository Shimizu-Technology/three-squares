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

  context "with the published fixed-page reporting contract" do
    it "enumerates fixed 1000-row pages without sending PageSize or claiming financial success" do
      calls = []
      responses = [ published_page_xml(total: 1001), published_page_xml(total: 1001, page: 2) ]
      instance = published_report_client(transport: ->(**request) { calls << request; responses.shift })
      result = instance.query_all(fields: published_query_fields)
      expect(result).to include(status: "unknown", complete: true, pages_read: 2)
      expect(result[:rows].length).to eq(1001)
      expect(result[:rows].map { |row| row[:raw_id] }.uniq.length).to eq(1001)
      expect(result[:rows]).to all(include(status: "unknown", captured_cents: nil, approved_cents: nil, currency: nil))
      expect(calls.map { |request| request[:interface] }).to eq([ :reporting, :reporting ])
      calls.each_with_index do |request, index|
        expect(request[:body]).to include("<PageNumber>#{index + 1}</PageNumber>")
        expect(request[:body]).not_to include("PageSize", "IdempotencyKey")
      end
    end

    it "rejects custom sizes, caller pagination and inconsistent request/response contracts before dispatch" do
      transport = double("offline transport")
      expect(transport).not_to receive(:call)
      instance = published_report_client(transport: transport)
      [ 1, 999, 1001, "1000", nil ].each do |size|
        expect { instance.transaction_query_pagination(fields: published_query_fields, page_number: 1, page_size: size) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
      end
      %w[PageNumber PageSize].each do |name|
        fields = { "Parameters" => published_query_fields["Parameters"].merge(name => "1") }
        expect { instance.transaction_query_pagination(fields: fields, page_number: 1) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
      end
      generic = client(transport: transport, report_contract: Payments::Worldpay::PublishedContract.report_contract)
      expect { generic.transaction_query_pagination(fields: {}, page_number: 1) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    end

    it "requires the requested page even when reading just one page" do
      instance = published_report_client(transport: ->(**) { published_page_xml(total: 1001, page: 2) })
      result = instance.transaction_query_pagination(fields: published_query_fields, page_number: 1)
      expect(result).to include(complete: false, rows: [])
      expect(result.dig(:metadata, :parse_error)).to eq("unexpected_report_page")
    end

    it "keeps changed counts, missing IDs, identical or changed overlaps and malformed later pages incomplete" do
      first = published_page_xml(total: 1001)
      second = published_page_xml(total: 1001, page: 2)
      [ published_page_xml(total: 1002, page: 2), published_page_xml(total: 2001, page: 2),
        second.sub("transaction-1001", "transaction-1"), second.sub("transaction-1001", "transaction-1").sub("Approved", "Changed"),
        second.sub("<TransactionID>transaction-1001</TransactionID>", ""), "<broken" ].each do |xml|
        responses = [ first, xml ]
        result = published_report_client(transport: ->(**) { responses.shift }).query_all(fields: published_query_fields)
        expect(result).to include(complete: false)
        expect(result[:rows].length).to eq(1000)
        expect(result.dig(:metadata, :parse_error)).not_to be_nil
      end
    end

    it "bounds pages and aggregate memory and never checkpoints unproven empty reports" do
      responses = [ published_page_xml(total: 1001), published_page_xml(total: 1001, page: 2) ]
      result = published_report_client(transport: ->(**) { responses.shift }).query_all(fields: published_query_fields, max_rows: 1000)
      expect(result).to include(complete: false, pages_read: 2)
      expect(result.dig(:metadata, :parse_error)).to eq("report_aggregate_row_limit")
      result = published_report_client(transport: ->(**) { published_page_xml(total: 1001) }).query_all(fields: published_query_fields, max_pages: 1)
      expect(result.dig(:metadata, :parse_error)).to eq("report_page_limit")
      result = published_report_client(transport: ->(**) { published_page_xml(total: 0, rows: "") }).query_all(fields: published_query_fields)
      expect(result).to include(complete: false, rows: [])
      expect(result.dig(:metadata, :parse_error)).to eq("report_count_proof_required")
      transport = double("offline transport")
      expect(transport).not_to receive(:call)
      expect do
        published_report_client(transport: transport).query_all(fields: published_query_fields, max_rows: 10_001)
      end.to raise_error(Payments::Worldpay::Configuration::Invalid, "invalid_report_bounds")
      expect(described_class::MAX_REPORT_ROWS).to eq(10_000)
    end
  end

  it "does not checkpoint a generic empty report without total-count proof" do
    contract = report_contract.except(:total_path)
    instance = client(report_contract: contract, transport: ->(**) { report_xml(total: 0, rows: "") })
    result = instance.query_all(fields: {})
    expect(result).to include(complete: false, rows: [])
    expect(result.dig(:metadata, :parse_error)).to eq("report_count_proof_required")
  end
end
