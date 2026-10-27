# Shared public, synthetic fixtures only. These tests load no Rails environment.
RSpec.shared_examples "a representative Worldpay response parser" do
  let(:fixture_options) { { raw_id: "sim_transaction_1", amount_cents: 2305, reference_number: "sim_attempt_1", status: :captured } }
  let(:sale_operation) { described_class == Payments::Worldpay::ExpressParser ? "CreditCardSale" : "sale" }
  let(:query_operation) { described_class == Payments::Worldpay::ExpressParser ? "TransactionQuery" : "query" }
  let(:setup_operation) { described_class == Payments::Worldpay::ExpressParser ? "TransactionSetup" : "setup" }
  let(:authorization_operation) { described_class == Payments::Worldpay::ExpressParser ? "CreditCardAuthorization" : "authorization" }
  let(:completion_operation) { described_class == Payments::Worldpay::ExpressParser ? "CreditCardAuthorizationCompletion" : "completion" }

  def parse_fixture(**overrides)
    described_class.call(described_class.fixture(**fixture_options.merge(overrides)))
  end

  it "round-trips a full capture with the normalized public interface" do
    expect(parse_fixture).to include(status: "captured", raw_id: "sim_transaction_1", requested_cents: 2305,
                                    approved_cents: 2305, captured_cents: 2305, currency: "USD", reference_number: "sim_attempt_1")
    expect(parse_fixture[:metadata]).to include(representative: true, express_response_code: "0", normalized_express_response_code: 0,
                                              fraud_failed: false, compensation_required: false)
  end

  %i[captured collecting failed unknown partial cancelled].each do |status|
    it("round-trips #{status}") { expect(parse_fixture(status: status)[:status]).to eq(status.to_s) }
  end

  it "preserves raw Express and host codes independently" do
    result = parse_fixture(code: "0000", host_code: "00")
    expect(result[:status]).to eq("captured")
    expect(result[:metadata]).to include(express_response_code: "0000", normalized_express_response_code: 0, host_response_code: "00")
    expect(parse_fixture(code: "1001", host_code: "00")[:status]).to eq("unknown")
  end

  [ "5", "20", "21", "22", "23", "1001", "1002", "1009", "9999", "bad", "" ].each do |code|
    it "does not promote a claimed capture with Express code #{code.inspect}" do
      expect(parse_fixture(code: code)[:status]).to eq("unknown")
    end
  end

  [ "20", "21", "24", "25", "101", "108", "120" ].each do |code|
    it("classifies definitive failure #{code}") { expect(parse_fixture(status: :failed, code: code)[:status]).to eq("failed") }
  end

  [ "22", "23", "1001", "1002", "1009", "30", "90", "9999" ].each do |code|
    it("keeps failure-looking code #{code} unknown") { expect(parse_fixture(status: :failed, code: code)[:status]).to eq("unknown") }
  end

  it "requires explicit partial amounts and compensation" do
    result = parse_fixture(status: :partial, approved_cents: 1000, captured_cents: 1000)
    expect(result).to include(status: "partial", requested_cents: 2305, approved_cents: 1000, captured_cents: 1000)
    expect(result[:metadata][:compensation_required]).to be(true)
    expect(parse_fixture(status: :partial, approved_cents: 1000, captured_cents: 0)[:status]).to eq("partial")
    [ 0, 2305, 2306 ].each do |approved|
      expect(parse_fixture(status: :partial, approved_cents: approved)[:status]).to eq("unknown")
    end
  end

  [ { approved_cents: 2304 }, { captured_cents: 2304 }, { captured_cents: 2306 }, { approved_cents: 2306 },
    { raw_id: nil }, { raw_id: "" }, { reference_number: nil }, { approval_number: nil }, { currency: "EUR" } ].each do |overrides|
    it "fails closed for inconsistent/missing approval #{overrides.inspect}" do
      result = parse_fixture(**overrides)
      expect(result[:status]).to eq("unknown")
      expect(result[:captured_cents]).to be_nil
      expect(result[:metadata][:parse_error]).to be_a(String)
    end
  end

  it "keeps actual money on fraud failure and marks compensation" do
    [ { avs_result: "N" }, { cvv_result: "N" } ].each do |fraud|
      result = parse_fixture(**fraud)
      expect(result).to include(status: "captured", captured_cents: 2305)
      expect(result[:metadata]).to include(fraud_failed: true, compensation_required: true)
    end
    expect(parse_fixture(avs_result: "Y", cvv_result: "M")[:metadata][:fraud_failed]).to be(false)
    expect(parse_fixture(status: :failed, avs_result: "N")[:metadata][:compensation_required]).to be(false)
  end

  it "does not treat setup or query success as a sale" do
    [ setup_operation, query_operation ].each do |operation|
      expect(parse_fixture(operation: operation, status: :collecting)).to include(status: "collecting", captured_cents: 0)
      expect(parse_fixture(operation: operation)[:status]).to eq("unknown")
    end
  end

  it "requires completion for captured authorization money" do
    expect(parse_fixture(operation: authorization_operation)[:status]).to eq("unknown")
    expect(parse_fixture(operation: completion_operation)[:status]).to eq("captured")
  end

  it "never labels money-moving decline or cancellation as no-charge" do
    [ :failed, :cancelled ].each do |status|
      expect(parse_fixture(status: status, approved_cents: 100, captured_cents: 100)[:status]).to eq("unknown")
    end
  end

  it "escapes and round-trips identifier text safely" do
    reference = "sim<&\"'reference"
    expect(parse_fixture(reference_number: reference)[:reference_number]).to eq(reference)
  end

  it "preserves a numeric attempt reference as a string" do
    expect(parse_fixture(reference_number: "12345")[:reference_number]).to eq("12345")
  end

  [ 1, 29, 100, Payments::Worldpay::Money::MAX_CENTS ].each do |cents|
    it("round-trips #{cents} cents exactly") { expect(parse_fixture(amount_cents: cents)[:captured_cents]).to eq(cents) }
  end

  [ nil, {}, [], 23, "", " ", "not a response", "x" * 65_537, "\xFF".b ].each do |wire|
    it "returns unknown for unusable input #{wire.class}/#{wire.to_s.bytesize} bytes" do
      result = described_class.call(wire)
      expect(result).to include(status: "unknown", captured_cents: nil)
      expect(result[:metadata][:parse_error]).to be_a(String)
    end
  end

  it "rejects invalid fixture inputs rather than silently rounding" do
    expect { described_class.fixture(**fixture_options.merge(amount_cents: 23.05)) }.to raise_error(Payments::Worldpay::Money::Invalid)
    expect { described_class.fixture(**fixture_options.merge(status: :invented)) }.to raise_error(ArgumentError)
  end
end
