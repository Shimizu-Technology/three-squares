require "spec_helper"
require_relative "../../../../app/services/payments/worldpay/express_parser"
require_relative "parser_examples"

RSpec.describe Payments::Worldpay::ExpressParser do
  include_examples "a representative Worldpay response parser"

  let(:wire) { described_class.fixture(**fixture_options) }

  it "rejects all DTD/entity declarations without invoking an external resource" do
    [ '<!DOCTYPE CreditCardSaleResponse SYSTEM "https://invalid.example/dtd">',
      '<!DOCTYPE CreditCardSaleResponse [<!ENTITY xxe SYSTEM "file:///nonexistent-worldpay-fixture">]>',
      '<!DOCTYPE CreditCardSaleResponse [<!ENTITY bomb "expansion">]>' ].each do |declaration|
      input = wire.sub(/<\?xml[^>]*\?>/, declaration).sub("sim_transaction_1", "&xxe;")
      expect(described_class.call(input)).to include(status: "unknown", captured_cents: nil)
      expect(described_class.call(input)[:metadata][:parse_error]).to eq("unsafe_xml")
    end
    expect(described_class.call(wire.sub("sim_transaction_1", "&undefined;"))[:status]).to eq("unknown")
  end

  it "rejects UTF-16 declarations and unclosed/multiple-root documents" do
    [ wire.encode("UTF-16LE"), wire.sub("</Response>", ""), wire + "<other/>", "<!-- only a comment -->" ].each do |input|
      expect(described_class.call(input)[:status]).to eq("unknown")
    end
  end

  it "rejects duplicate fields and transaction/response containers" do
    [ wire.sub("<ExpressResponseCode>0</ExpressResponseCode>", "<ExpressResponseCode>20</ExpressResponseCode><ExpressResponseCode>0</ExpressResponseCode>"),
      wire.sub("</Response>", "<Transaction/></Response>"),
      wire.sub("</CreditCardSaleResponse>", "<Response/></CreditCardSaleResponse>"),
      wire.sub("<TransactionID>sim_transaction_1</TransactionID>", "<TransactionID><Nested>sim_transaction_1</Nested></TransactionID>") ].each do |input|
      expect(described_class.call(input)[:status]).to eq("unknown")
    end
  end

  it "accepts a consistent namespace and rejects namespace spoofing" do
    namespaced = wire.sub("<CreditCardSaleResponse>", '<CreditCardSaleResponse xmlns="urn:representative:express">')
    expect(described_class.call(namespaced)[:status]).to eq("captured")
    spoofed = namespaced.sub("<ExpressResponseCode>", '<ExpressResponseCode xmlns="urn:other">')
    expect(described_class.call(spoofed)[:status]).to eq("unknown")
  end

  it "ignores unknown values and retains only unknown field paths in metadata" do
    input = wire.sub("</Response>", "<FutureField>do-not-retain</FutureField></Response>")
    result = described_class.call(input)
    expect(result[:status]).to eq("captured")
    expect(result[:metadata][:unknown_fields]).to eq([ "Response/FutureField" ])
    expect(result.to_s).not_to include("do-not-retain")
  end

  it "enforces nesting, row, node and name bounds even in unknown fields" do
    deep = "<Extra>" * 20 + "value" + "</Extra>" * 20
    rows = "<Row/>" * (described_class::MAX_ROWS + 1)
    nodes = "<Group>#{'<Value/>' * 30}</Group>" * 70
    name = "<#{'X' * 257}/>"
    [ deep, rows, nodes, name ].each do |extra|
      result = described_class.call(wire.sub("</Response>", "#{extra}</Response>"))
      expect(result).to include(status: "unknown", captured_cents: nil)
    end
  end

  it "requires every amount and currency rather than inferring approval" do
    %w[TransactionAmount ApprovedAmount CapturedAmount CurrencyCode ExpressResponseCode].each do |field|
      expect(described_class.call(wire.sub(/<#{field}>[^<]*<\/#{field}>/, ""))[:status]).to eq("unknown")
    end
    %w[1e2 23.050 -23.05 NaN].each do |amount|
      expect(described_class.call(wire.sub("<ApprovedAmount>23.05</ApprovedAmount>", "<ApprovedAmount>#{amount}</ApprovedAmount>"))[:status]).to eq("unknown")
    end
  end

  it "recognizes authorization as collecting only with explicit approved money and no capture" do
    input = described_class.fixture(**fixture_options, operation: "CreditCardAuthorization", status: :collecting,
                                   approved_cents: 2305, captured_cents: 0).sub("<TransactionStatus>Pending</TransactionStatus>", "<TransactionStatus>Approved</TransactionStatus>")
    expect(described_class.call(input)).to include(status: "collecting", approved_cents: 2305, captured_cents: 0)
  end
end
