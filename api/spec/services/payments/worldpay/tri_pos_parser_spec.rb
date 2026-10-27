require "spec_helper"
require_relative "../../../../app/services/payments/worldpay/tri_pos_parser"
require_relative "parser_examples"

RSpec.describe Payments::Worldpay::TriPosParser do
  include_examples "a representative Worldpay response parser"

  let(:wire) { described_class.fixture(**fixture_options) }

  def mutate_wire
    data = JSON.parse(wire, decimal_class: Payments::Worldpay::Money::DecimalLexeme)
    yield data
    JSON.generate(data)
  end

  it "emits exact JSON numeric amounts without strings or binary float artifacts" do
    expect(wire).to include('"transactionAmount":23.05', '"approvedAmount":23.05', '"capturedAmount":23.05')
    expect(described_class.fixture(**fixture_options, amount_cents: 29)).to include('"capturedAmount":0.29')
  end

  it "rejects excess fractional digits and scientific numeric lexemes before precision is lost" do
    %w[23.050 23.051 2.305e1 NaN Infinity -23.05].each do |token|
      result = described_class.call(wire.sub('"approvedAmount":23.05', '"approvedAmount":' + token))
      expect(result).to include(status: "unknown", captured_cents: nil)
    end
  end

  it "rejects duplicate and escaped duplicate JSON keys at every level" do
    [ wire.sub('"expressResponseCode":"0"', '"expressResponseCode":"20","expressResponseCode":"0"'),
      wire.sub('"expressResponseCode":"0"', '"expressResponseCode":"20","expressResponse\u0043ode":"0"'),
      wire.sub('"_errors":[]', '"future":{"key":1,"key":2}') ].each do |input|
      expect(described_class.call(input)[:metadata][:parse_error]).to eq("duplicate_key")
    end
  end

  it "rejects inconsistent booleans, approval flags, errors and invalid root types" do
    [ mutate_wire { |data| data["isApproved"] = "true" }, mutate_wire { |data| data["isApproved"] = false },
      mutate_wire { |data| data.delete("isPartialApproval") }, mutate_wire { |data| data["isCancelled"] = true },
      mutate_wire { |data| data["_errors"] = [ { "code" => "fixture-error" } ] },
      mutate_wire { |data| data["transactionType"] = "refund" }, "[]", "null", "true", "23.05" ].each do |input|
      expect(described_class.call(input)).to include(status: "unknown", captured_cents: nil)
    end
  end

  it "requires all approval amounts and currency" do
    %w[transactionAmount approvedAmount capturedAmount currencyCode expressResponseCode].each do |key|
      input = mutate_wire { |data| data.delete(key) }
      expect(described_class.call(input)[:status]).to eq("unknown")
    end
  end

  it "bounds unknown nested objects, arrays, total values and key lengths" do
    deep = { "value" => 1 }
    20.times { deep = { "next" => deep } }
    many_nodes = Array.new(90) { Array.new(30, 1) }
    [ { "future" => deep }, { "future" => Array.new(described_class::MAX_ROWS + 1, 1) },
      { "future" => many_nodes }, { "X" * 257 => 1 } ].each do |extra|
      input = mutate_wire { |data| data.merge!(extra) }
      expect(described_class.call(input)).to include(status: "unknown", captured_cents: nil)
    end
  end

  it "retains unknown field names without retaining unknown values or JSON additions" do
    input = mutate_wire { |data| data["future"] = "do-not-retain"; data["json_class"] = "UntrustedClass" }
    result = described_class.call(input)
    expect(result[:status]).to eq("captured")
    expect(result[:metadata][:unknown_fields]).to eq(%w[future json_class])
    expect(result.to_s).not_to include("do-not-retain", "UntrustedClass")
  end

  it "recognizes authorization without confusing it with capture" do
    input = mutate_wire do |data|
      data["transactionType"] = "authorization"
      data["transactionStatus"] = "Approved"
      data["capturedAmount"] = 0
    end
    expect(described_class.call(input)).to include(status: "collecting", approved_cents: 2305, captured_cents: 0)
  end
end
