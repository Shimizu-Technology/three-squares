require "spec_helper"
require_relative "../../../../app/services/payments/worldpay/money"

RSpec.describe Payments::Worldpay::Money do
  describe ".parse" do
    { "0.01" => 1, "1" => 100, "1.2" => 120, "23.05" => 2305, "99999999.99" => described_class::MAX_CENTS }.each do |wire, cents|
      it("parses #{wire} exactly") { expect(described_class.parse(wire)).to eq(cents) }
    end

    [ nil, true, {}, [], 0.29, BigDecimal("1.23"), "", " 1.00", "1.00 ", "+1", "-1", "1,000", "01.00", ".5", "1.",
      "1e2", "1E-2", "NaN", "Infinity", "0", "0.00", "1.001", "1.230", "100000000.00", "9" * 1000 ].each do |wire|
      it "rejects invalid amount #{wire.inspect[0, 50]}" do
        expect { described_class.parse(wire) }.to raise_error(described_class::Invalid)
      end
    end

    it "accepts exact JSON lexemes and integral dollars without accepting floats" do
      expect(described_class.parse(described_class::DecimalLexeme.new("0.29"))).to eq(29)
      expect(described_class.parse(23)).to eq(2300)
      expect { described_class.parse(described_class::DecimalLexeme.new("1.230")) }.to raise_error(described_class::Invalid)
    end

    it "only allows zero explicitly and only allows USD" do
      expect(described_class.parse("0.00", allow_zero: true)).to eq(0)
      %w[EUR usd US].each do |currency|
        expect { described_class.parse("1.00", currency: currency) }.to raise_error(described_class::Invalid, "unsupported_currency")
      end
    end
  end

  describe ".format" do
    it "writes exactly two decimal places across the bound" do
      { 1 => "0.01", 29 => "0.29", 100 => "1.00", 2305 => "23.05", described_class::MAX_CENTS => "99999999.99" }.each do |cents, wire|
        expect(described_class.format(cents)).to eq(wire)
        expect(described_class.parse(wire)).to eq(cents)
      end
      expect(described_class.format(0, allow_zero: true)).to eq("0.00")
    end

    [ nil, 0, -1, 1.0, "100", described_class::MAX_CENTS + 1 ].each do |cents|
      it("rejects invalid cents #{cents.inspect}") { expect { described_class.format(cents) }.to raise_error(described_class::Invalid) }
    end
  end
end
