# frozen_string_literal: true

require_relative "support"

RSpec.describe Payments::Worldpay::TriPosClient, tripos_client: true do
  let(:transport) { TriPosClientSupport::MemoryTransport.new(JSON.generate(sale_data)) }
  let(:client) { described_class.new(configuration: configuration, transport: transport) }

  def sale(**changes)
    client.sale(**{ lane_id: 12, amount_cents: 29, reference: "synthetic-reference" }.merge(changes))
  end

  def query(**changes)
    client.query(**{ reference: "synthetic-reference", terminal_id: "synthetic-terminal",
      begin_time: "2026-10-26 00:00:00", end_time: "2026-10-27 23:59:59" }.merge(changes))
  end

  it "requires an explicit transport with no default network path" do
    expect { described_class.new(configuration: configuration) }.to raise_error(ArgumentError)
    expect { described_class.new(configuration: configuration, transport: nil) }.to raise_error(described_class::Invalid)
    disabled = Payments::Worldpay::TriPosTransport.new(configuration: configuration)
    expect { disabled.call(method: :post, path: "/api/v1/sale", body: "{}", headers: {}) }.to raise_error(Payments::Worldpay::TriPosTransport::Disabled)
    offline = described_class.new(configuration: configuration, transport: disabled)
    result = offline.sale(lane_id: 1, amount_cents: 29, reference: "synthetic-reference")
    expect(result[:ambiguity_hints]).to include("transport_outcome_unknown", "possible_financial_result")
    expect(disabled.inspect).to include("disabled", "REDACTED")
    expect { Payments::Worldpay::TriPosTransport.new(configuration: nil) }.to raise_error(Payments::Worldpay::TriPosConfiguration::Invalid)
  end

  it "posts an exact decimal STRING sale amount and parses native response facts" do
    result = sale(configuration: { "allowPartialApprovals" => false, "checkForDuplicateTransactions" => true })
    request = transport.requests.last
    expect(request).to include(method: :post, path: "/api/v1/sale")
    expect(JSON.parse(request[:body])).to eq("laneId" => 12, "transactionAmount" => "0.29", "referenceNumber" => "synthetic-reference",
      "configuration" => { "allowPartialApprovals" => false, "checkForDuplicateTransactions" => true })
    expect(result).to include(authorizing: false, financial_outcome: :unknown, request_id_echo_verified: true)
    expect(result.dig(:observations, :approved_amount_cents)).to eq(29)
    expect(result[:request_id]).to eq(request[:headers]["tp-request-id"])
  end

  it "generates new request UUIDs on every call without reusing references as IDs" do
    3.times { sale }
    ids = transport.requests.map { |request| request[:headers]["tp-request-id"] }
    expect(ids.uniq.size).to eq(3)
    expect(ids).to all(match(Payments::Worldpay::TriPosConfiguration::GUID))
    expect(transport.requests.map { |request| request[:headers]["tp-authorization"] }).to all(eq("Version=2.0"))
  end

  it "posts the required string query window even when transaction ID is present" do
    transport.wire = query_wire([ report_row ])
    result = query(transaction_id: "synthetic-transaction")
    request = transport.requests.last
    expect(request).to include(method: :post, path: "/api/v1/transactionQuery")
    expect(JSON.parse(request[:body])).to eq("referenceNumber" => "synthetic-reference", "terminalId" => "synthetic-terminal",
      "transactionDateTimeBegin" => "2026-10-26 00:00:00", "transactionDateTimeEnd" => "2026-10-27 23:59:59", "transactionId" => "synthetic-transaction")
    expect(result[:rows].size).to eq(1)
    expect(result[:authorizing]).to be(false)
  end

  it "rejects invalid, nonstring, reversed and unnormalized timestamp windows before dispatch" do
    [ nil, Time.now, "2026-02-30 01:00:00", "2026-10-26T00:00:00Z", "2026-10-26 24:00:00", "2026-10-26 00:00:60" ].each do |value|
      expect { query(begin_time: value) }.to raise_error(described_class::Invalid)
    end
    expect { query(begin_time: "2026-10-28 00:00:00") }.to raise_error(described_class::Invalid)
    expect(transport.requests).to be_empty
  end

  it "does not dispatch invalid money, lane or unsupported configuration fields" do
    [ 0, -1, 0.29, "29", 10_000_000_000, nil ].each { |value| expect { sale(amount_cents: value) }.to raise_error(described_class::Invalid) }
    [ "12", 0, 1_000_000, "1/../../sale", nil ].each { |value| expect { sale(lane_id: value) }.to raise_error(described_class::Invalid) }
    [ { "unknownFlag" => true }, { "allowPartialApprovals" => "false" }, { allowDebit: true },
      { "accountNumber" => "4111111111111111" }, { "tipOptions" => {} }, { "allowedPaymentTypes" => [] },
      { "cardReadRetries" => 1.5 }, { "marketCode" => "bad\r\nheader" } ].each do |config|
      expect { sale(configuration: config) }.to raise_error(described_class::Invalid)
    end
    expect(transport.requests).to be_empty
  end

  it "requires an exact single echoed transaction request ID" do
    transport.echo = false
    [ {}, { "tp-request-id" => "wrong" }, { "tp-request-id" => "wrong", "TP-REQUEST-ID" => "also-wrong" } ].each do |headers|
      transport.response_headers = headers
      expect(sale[:ambiguity_hints]).to include("request_id_echo_mismatch")
    end
    transport.echo = true
    transport.response_headers = { "tp-request-id" => "duplicate" }
    expect(sale[:ambiguity_hints]).to include("request_id_echo_mismatch")
    expect(transport.requests.size).to eq(4)
  end

  it "keeps HTTP failures and redirects unknown with exactly one dispatch and no retry" do
    [ 201, 202, 301, 302, 400, 401, 500, "200", 200.0 ].each do |status|
      transport.status = status
      before = transport.requests.size
      result = sale
      expect(result[:ambiguity_hints]).to include("http_outcome_unknown")
      expect(result[:authorizing]).to be(false)
      expect(transport.requests.size).to eq(before + 1)
    end
  end

  it "redacts exceptions, inspects and credential reflections without leaking a cause" do
    transport.exception = StandardError.new("synthetic-secret-token raw financial body")
    result = sale
    expect(result[:ambiguity_hints]).to include("transport_outcome_unknown")
    expect(result.to_s).not_to include("synthetic-secret-token", "raw financial body")
    expect(client.inspect).to include("REDACTED")
    expect("#{client}").not_to include("synthetic")
    transport.exception = nil
    transport.wire = JSON.generate(sale_data(transactionId: "synthetic-secret-token"))
    expect(sale[:ambiguity_hints]).to include("credential_reflection")
    expect { sale(reference: "synthetic-secret-token") }.to raise_error(described_class::Invalid) do |error|
      expect(error.message).not_to include("synthetic-secret-token")
      expect(error.cause).to be_nil
    end
  end

  it "treats malformed transport shapes, header injection and oversized bodies as unknown" do
    [ nil, [], { status: 200, headers: {}, body: "{}" } ].each do |response|
      fake = ->(**_) { response }
      result = described_class.new(configuration: configuration, transport: fake).sale(lane_id: 1, amount_cents: 29, reference: "synthetic")
      expect(result[:authorizing]).to be(false)
      expect(result[:observations]).to be_empty
    end
    transport.response_headers = { "Injected" => "value\r\nheader" }
    expect(sale[:ambiguity_hints]).to include("invalid_response_headers")
    transport.response_headers = {}
    transport.wire = " " * (Payments::Worldpay::TriPosResponseParser::MAX_BYTES + 1)
    expect(sale[:ambiguity_hints]).to include("invalid_input")
  end

  it "keeps pre-read cancellation a nonfinancial envelope even if sale fields appear" do
    result = client.pre_read_cancel(lane_id: 12)
    expect(transport.requests.last).to include(method: :post, path: "/api/v1/cancel", body: '{"laneId":12}')
    expect(result[:observations]).to eq(has_errors: false, error_count: 0)
    expect(result).to include(authorizing: false, financial_operation: false)
  end

  it "pairs with the documented 200, no invented flags and no unverified lane echo check" do
    transport.echo = false
    transport.wire = '{"laneId":12,"terminalId":"synthetic-terminal"}'
    result = client.pair(lane_id: 12, terminal_id: "synthetic-terminal", activation_code: "synthetic-code", description: "Synthetic lane")
    request = transport.requests.last
    expect(request).to include(method: :post, path: "/cloudapi/v1/lanes")
    expect(JSON.parse(request[:body])).to eq("laneId" => 12, "terminalId" => "synthetic-terminal", "activationCode" => "synthetic-code", "description" => "Synthetic lane")
    expect(request[:headers]).not_to have_key("tp-authorization")
    expect(result).to include(http_status: 200, request_id_echo_verified: false, authorizing: false)
    client.lane(lane_id: 12)
    expect(transport.requests.last).to include(method: :get, path: "/cloudapi/v1/lanes/12", body: nil)
  end

  it "reads cached connection status and deletes without fabricating proof" do
    transport.wire = '{"status":"SyntheticUnknown","timeStamp":"2026-10-27T00:00:00Z"}'
    result = client.lane_status(lane_id: 12)
    expect(transport.requests.last[:path]).to eq("/cloudapi/v1/lanes/12/connectionstatus")
    expect(result[:observations]).to include(cached: true, maximum_staleness_seconds: 75)
    transport.wire = ""
    result = client.delete_lane(lane_id: 12)
    expect(transport.requests.last).to include(method: :delete, path: "/cloudapi/v1/lanes/12", body: nil)
    expect(result[:ambiguity_hints]).to include("delete_response_has_no_published_schema")
    expect(result[:observations]).to be_empty
  end

  it "builds blocked refund/return/void/reversal plans with YAML-specific amount types" do
    refund = client.refund(lane_id: 12, amount_cents: 29, reference: "synthetic-reference")
    linked = client.linked_return(lane_id: 12, transaction_id: "synthetic-transaction", payment_type: "synthetic-credit", amount_cents: 29, reference: "synthetic-reference")
    void = client.void(lane_id: 12, transaction_id: "synthetic-transaction", reference: "synthetic-reference")
    reversal = client.reversal(lane_id: 12, transaction_id: "synthetic-transaction", payment_type: "synthetic-credit", amount_cents: 29,
      reference: "synthetic-reference", type: "synthetic-type")
    expect(refund.path).to eq("/api/v1/refund")
    expect(refund.body).to include('"transactionAmount":"0.29"')
    expect(linked.path).to eq("/api/v1/return/synthetic-transaction/synthetic-credit")
    expect(linked.body).to include('"transactionAmount":0.29')
    expect(void.path).to eq("/api/v1/void/synthetic-transaction")
    expect(void.body).not_to include("transactionAmount")
    expect(reversal.path).to eq("/api/v1/reversal/synthetic-transaction/synthetic-credit")
    expect(reversal.body).to include('"transactionAmount":0.29')
    [ refund, linked, void, reversal ].each do |plan|
      expect(plan.dispatchable?).to be(false)
      expect(plan.authorizing?).to be(false)
      expect(plan.financial_outcome).to eq(:unknown)
      expect(plan.blockers).to include("assigned_mutation_contract_required")
      expect(plan.inspect).to include("blocked", "REDACTED")
      expect(plan).to be_frozen
    end
    expect(transport.requests).to be_empty
  end

  it "blocks description updates because the published PATCH schema has no description field" do
    result = client.update_lane(lane_id: 12, description: "Synthetic lane")
    expect(result).to have_attributes(method: :patch, path: "/cloudapi/v1/lanes/12", body: '{"description":"Synthetic lane"}')
    expect(result.blockers).to include("description_update_contract_unverified")
    expect(result.dispatchable?).to be(false)
    expect(transport.requests).to be_empty
  end

  it "rejects path injection and no-ID reversal before building/dispatching" do
    [ "../sale", "a/b", "a?query", "a#frag", "%2f", "a\\b", "a\nheader", nil, "" ].each do |value|
      expect { client.void(lane_id: 12, transaction_id: value, reference: "synthetic") }.to raise_error(described_class::Invalid)
    end
    expect { client.reversal(lane_id: 12, transaction_id: nil, payment_type: "credit", amount_cents: 29, reference: "synthetic", type: "synthetic") }.to raise_error(described_class::Invalid)
    expect { client.linked_return(lane_id: 12, transaction_id: "synthetic", payment_type: "credit/../../sale", amount_cents: 29, reference: "synthetic") }.to raise_error(described_class::Invalid)
    expect(client).not_to respond_to(:cancel)
    expect(transport.requests).to be_empty
  end
end
