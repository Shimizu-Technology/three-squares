# frozen_string_literal: true

require "rspec/autorun"
require_relative "../../../../app/services/payments/reconciliation/canonical_csv"

RSpec.describe Payments::Reconciliation::CanonicalCSV do
  let(:context) { { "account_id" => "0007", "environment" => "simulated", "currency" => "USD" } }
  let(:base) { context.merge("schema_version" => described_class::VERSION, "external_id" => "source.0001") }
  let(:batch) do
    base.merge("record_type" => "batch", "batch_id" => "0000123", "amount_cents" => "-25",
      "sales_cents" => "100", "returns_cents" => "100", "fees_cents" => "30", "adjustments_cents" => "5",
      "business_date" => "2026-10-28", "provider_batch_date" => "2026-10-27")
  end
  let(:item) do
    base.merge("record_type" => "item", "batch_id" => "0000123", "entry_type" => "sale", "amount_cents" => "29",
      "occurred_at" => "2026-10-28T00:01:02.123456+10:00", "business_date" => "2026-10-28")
  end
  let(:deposit) { base.merge("record_type" => "deposit", "deposit_id" => "0005", "amount_cents" => "-25", "deposit_date" => "2026-10-30") }
  let(:allocation) { base.merge("record_type" => "allocation", "batch_id" => "0000123", "deposit_id" => "0005", "amount_cents" => "-25") }

  def csv_for(*records, headers: described_class::HEADERS)
    CSV.generate(row_sep: "\n") do |csv|
      csv << headers
      records.each { |record| csv << headers.map { |field| record[field] } }
    end
  end

  def parse(text)
    described_class.parse(text, context: context)
  end

  def read_record(record)
    parse(csv_for(record))[:records].first
  end

  def reject_record(record, field)
    expect { read_record(record) }.to raise_error(described_class::Invalid, /row 2 field #{field}:/)
  end

  it "is a standalone standard-library port without Rails or ActiveRecord" do
    expect(defined?(Rails)).to be_nil
    expect(defined?(ActiveRecord)).to be_nil
  end

  it "returns deeply frozen typed records with string keys and exact input checksum" do
    text = csv_for(batch, item, deposit, allocation)
    result = parse(text)
    expect(result.keys).to eq([ :records, :sha256 ])
    expect(result[:sha256]).to eq(Digest::SHA256.hexdigest(text))
    expect(result).to be_frozen
    expect(result[:sha256]).to be_frozen
    expect(result[:records]).to be_frozen
    result[:records].each do |record|
      expect(record).to be_frozen
      expect(record.keys).to eq(described_class::HEADERS)
      expect(record.keys).to all(be_a(String).and(be_frozen))
      expect(record.values).to all(be_frozen)
    end
    expect(result[:records][0]).to include("amount_cents" => -25, "sales_cents" => 100, "batch_id" => "0000123", "account_id" => "0007")
    expect(result[:records][1]).to include("occurred_at" => "2026-10-27T14:01:02.123456Z", "description" => nil)
    expect(result[:records][2]["amount_cents"]).to eq(-25)
    expect(result[:records][3]["amount_cents"]).to eq(-25)
  end

  it "leaves equal duplicate observations for durable importer audit" do
    expect(parse(csv_for(item, item))[:records].length).to eq(2)
    expect(parse(csv_for(item, item.merge("amount_cents" => "30")))[:records].map { |row| row["amount_cents"] }).to eq([ 29, 30 ])
  end

  it "does not impose financial matching, signs, or derive dates" do
    fact = batch.merge("amount_cents" => "-999", "adjustments_cents" => "-5")
    expect(read_record(fact)["amount_cents"]).to eq(-999)
    expect(read_record(item.merge("entry_type" => "return", "amount_cents" => "-29"))["amount_cents"]).to eq(-29)
    expect(read_record(allocation)["business_date"]).to be_nil
    expect(read_record(deposit)["provider_batch_date"]).to be_nil
  end

  it "accepts all three environments only when the exact server context matches" do
    %w[production sandbox simulated].each do |environment|
      scope = context.merge("environment" => environment)
      expect(described_class.parse(csv_for(item.merge("environment" => environment)), context: scope)[:records].size).to eq(1)
    end
  end

  it "requires an exact string-key server context with a valid opaque account, environment and USD" do
    [ nil, {}, context.transform_keys(&:to_sym), context.merge("extra" => "x"),
      context.merge("environment" => "test"), context.merge("environment" => "Production"),
      context.merge("currency" => "usd"), context.merge("currency" => "EUR"),
      context.merge("account_id" => ""), context.merge("account_id" => 7),
      context.merge("account_id" => " account"), context.merge("account_id" => "=account"),
      context.merge("account_id" => "a" * 129) ].each do |scope|
      expect { described_class.parse(csv_for(item), context: scope) }.to raise_error(described_class::Invalid)
    end
  end

  { "account_id" => [ nil, "7", "other" ], "environment" => [ nil, "sandbox", "test" ], "currency" => [ nil, "EUR", "usd" ] }.each do |field, values|
    values.each do |value|
      it("rejects row/context mismatch for #{field} #{value.inspect}") { reject_record(item.merge(field => value), field) }
    end
  end

  it "requires version, type and observational external ID" do
    %w[schema_version record_type external_id].each { |field| reject_record(item.merge(field => nil), field) }
    reject_record(item.merge("schema_version" => "v1"), "schema_version")
    reject_record(item.merge("record_type" => "payment"), "record_type")
  end

  it "requires every type's mandatory fields" do
    [ batch, item, deposit, allocation ].each do |record|
      described_class::REQUIRED.fetch(record["record_type"]).each do |field|
        reject_record(record.merge(field => nil), field)
        reject_record(record.merge(field => ""), field)
      end
    end
  end

  it "rejects incompatible type-only fields" do
    { "entry_type" => "sale", "transaction_id" => "t1", "original_reference" => "r1", "deposit_id" => "d1", "deposit_date" => "2026-10-28" }.each do |field, value|
      reject_record(batch.merge(field => value), field)
    end
    %w[sales_cents returns_cents fees_cents adjustments_cents].each { |field| reject_record(item.merge(field => "0"), field) }
    reject_record(deposit.merge("batch_id" => "b1"), "batch_id")
    reject_record(deposit.merge("provider_batch_date" => "2026-10-28"), "provider_batch_date")
  end

  it "validates item entry types without changing their financial meaning" do
    %w[sale return void reversal fee adjustment].each do |type|
      expect(read_record(item.merge("entry_type" => type))["entry_type"]).to eq(type)
    end
    reject_record(item.merge("entry_type" => "refund"), "entry_type")
  end

  it "preserves bounded opaque identifiers including leading zeros" do
    %w[0 0000123 A_b.c:d-e 123456789012345678901234567890].push("a" * 128).each do |id|
      expect(read_record(item.merge("external_id" => id))["external_id"]).to eq(id)
    end
    [ "a" * 129, "-1", "+1", "=1", "@x", "_id", " a", "a ", "a/b", "é", "a,b", "a\"b" ].each do |id|
      reject_record(item.merge("external_id" => id), "external_id")
    end
    %w[batch_id transaction_id original_reference terminal_id].each do |field|
      expect(read_record(item.merge(field => "00005"))[field]).to eq("00005")
      reject_record(item.merge(field => "=bad"), field)
    end
  end

  it "accepts exact bounded signed cents and positive location integers" do
    %w[-2147483647 -1 -0 0 00029 2147483647].each do |value|
      expect(read_record(item.merge("amount_cents" => value))["amount_cents"]).to eq(Integer(value, 10))
    end
    %w[1 0002 2147483647].each do |value|
      expect(read_record(item.merge("location_id" => value))["location_id"]).to eq(Integer(value, 10))
    end
    %w[0 -1 2147483648].each { |value| reject_record(item.merge("location_id" => value), "location_id") }
  end

  %w[+1 1.0 1e2 1E2 1,000 0x10 NaN Infinity 2147483648 -2147483648].push(" 1", "1 ", "1_000").each do |value|
    it("rejects noncanonical or overflowing cents #{value.inspect}") { reject_record(item.merge("amount_cents" => value), "amount_cents") }
  end

  it "bounds every money field and forbids negative gross sales, returns and fees" do
    described_class::MONEY_FIELDS.each do |field|
      reject_record(batch.merge(field => "2147483648"), field)
      reject_record(batch.merge(field => "-2147483648"), field)
      expect(read_record(batch.merge(field => "2147483647"))[field]).to eq(2_147_483_647)
    end
    %w[sales_cents returns_cents fees_cents].each { |field| reject_record(batch.merge(field => "-1"), field) }
  end

  it "accepts strict real dates and rejects invalid or guessed dates" do
    expect(read_record(item.merge("business_date" => "2024-02-29"))["business_date"]).to eq("2024-02-29")
    %w[1500-02-29 2026-02-29 2026-13-01 2026-00-10 2026-10-00 2026-10-32 2026-1-01 26-01-01].push("2026-10-28 ", "2026-10-28T00:00:00Z").each do |date|
      reject_record(item.merge("business_date" => date), "business_date")
    end
    reject_record(batch.merge("provider_batch_date" => "bad"), "provider_batch_date")
    reject_record(deposit.merge("deposit_date" => "bad"), "deposit_date")
  end

  it "normalizes explicit instants to six-digit UTC and preserves provider originals independently" do
    record = item.merge("occurred_at" => "2026-10-28T00:01:02Z", "provider_local_time" => "2026-10-27 20:30:00", "provider_offset" => "-03:30")
    parsed = read_record(record)
    expect(parsed).to include("occurred_at" => "2026-10-28T00:01:02.000000Z", "provider_local_time" => "2026-10-27 20:30:00", "provider_offset" => "-03:30")
    expect(read_record(item.merge("occurred_at" => "2026-10-28T00:01:02.1-03:30"))["occurred_at"]).to eq("2026-10-28T03:31:02.100000Z")
  end

  it "rejects invalid timestamps, missing offsets, rollover times and excess precision" do
    %w[2026-10-28 2026-10-28T00:00:00 2026-02-29T00:00:00Z 2026-10-28T24:00:00Z
      2026-10-28T00:60:00Z 2026-10-28T00:00:60Z 2026-10-28T00:00:00+24:00
      2026-10-28T00:00:00+10:60 2026-10-28T00:00:00.1234567Z
      0000-01-01T00:00:00+23:59 9999-12-31T23:59:59-23:59].each do |instant|
      reject_record(item.merge("occurred_at" => instant), "occurred_at")
    end
  end

  it "requires valid paired provider local time and signed offset" do
    reject_record(item.merge("provider_local_time" => "2026-10-28 00:00:00"), "provider_local_time")
    reject_record(item.merge("provider_offset" => "+10:00"), "provider_local_time")
    [ "2026-02-29 00:00:00", "2026-10-28T00:00:00", "2026-10-28 24:00:00", "2026-10-28 00:00:60" ].each do |local|
      reject_record(item.merge("provider_local_time" => local, "provider_offset" => "+10:00"), "provider_local_time")
    end
    %w[Z 10:00 +24:00 -10:60].each do |offset|
      reject_record(item.merge("provider_local_time" => "2026-10-28 00:00:00", "provider_offset" => offset), "provider_offset")
    end
  end

  it "quotes descriptions safely and preserves Unicode and literal apostrophes" do
    [ "Café, \"closing\" 日本語 😀", "'ordinary", "'=SUM(A1:A2)", "'  +SUM(A1:A2)", "a" * 160 ].each do |description|
      parsed = read_record(item.merge("description" => description))
      expect(parsed["description"]).to eq(description)
      expect(parse(described_class.dump(records: [ parsed ], context: context))[:records]).to eq([ parsed ])
    end
  end

  it "requires a literal apostrophe for formula-leading descriptions, without silently escaping" do
    [ "=1+1", "+SUM(A1:A2)", "-cmd", "@SUM(A1:A2)", "   =1", "\u00a0=1" ].each do |description|
      reject_record(item.merge("description" => description), "description")
      expect { described_class.dump(records: [ read_record(item).merge("description" => description) ], context: context) }.to raise_error(described_class::Invalid)
    end
  end

  it "rejects control characters, newlines, long descriptions and cells over 512 bytes" do
    [ "a\nb", "a\rb", "a\tb", "a\0b", "a\u007Fb", "a\u0085b", "a" * 161, "😀" * 129 ].each do |description|
      reject_record(item.merge("description" => description), "description")
    end
    expect(read_record(item.merge("description" => "😀" * 128))["description"].bytesize).to eq(512)
    reject_record(item.merge("external_id" => "x" * 513), "external_id")
  end

  it "treats empty optional fields as nil but does not strip whitespace" do
    expect(read_record(item.merge("description" => "", "transaction_id" => ""))).to include("description" => nil, "transaction_id" => nil)
    expect(read_record(item.merge("description" => "  literal  "))["description"]).to eq("  literal  ")
    reject_record(item.merge("location_id" => " "), "location_id")
  end

  it "accepts one optional UTF-8 BOM and CRLF, hashes original bytes, and rejects other BOMs or invalid bytes" do
    text = "\uFEFF" + csv_for(item).gsub("\n", "\r\n")
    expect(parse(text)[:sha256]).to eq(Digest::SHA256.hexdigest(text))
    expect(parse(text.b)[:records]).to eq(parse(csv_for(item))[:records])
    [ "\uFEFF" + text, csv_for(item.merge("description" => "a\uFEFFb")), csv_for(item).b + "\xFF".b, "\xFF\xFE".b ].each do |invalid|
      expect { parse(invalid) }.to raise_error(described_class::Invalid)
    end
    expect(parse(text)[:sha256]).not_to eq(parse(csv_for(item))[:sha256])
  end

  it "requires exact headers with no duplicate, missing, reordered or extra columns" do
    headers = described_class::HEADERS
    [ headers.reverse, headers[0...-1], headers + [ "extra" ], headers[0...-1] + [ headers.first ] ].each do |altered|
      expect { parse(csv_for(item, headers: altered)) }.to raise_error(described_class::Invalid, /field headers:/)
    end
  end

  it "rejects empty files, no records, blank records, wrong column counts and malformed quoting" do
    header = CSV.generate_line(described_class::HEADERS)
    [ "", "\uFEFF", header, header + "\n", header + "a,b\n", csv_for(item).sub(/\n\z/, ",extra\n"),
      header + '"unterminated', header + 'bad"quote', header + '"closed"junk' ].each do |text|
      expect { parse(text) }.to raise_error(described_class::Invalid)
    end
    [ nil, [], 123 ].each { |text| expect { parse(text) }.to raise_error(described_class::Invalid) }
  end

  it "caps input at 1 MiB and record count at 1000" do
    expect(parse(csv_for(*Array.new(1000, item)))[:records].length).to eq(1000)
    expect { parse(csv_for(*Array.new(1001, item))) }.to raise_error(described_class::Invalid, /exceeds row limit/)
    expect { parse("x" * (described_class::MAX_BYTES + 1)) }.to raise_error(described_class::Invalid, /exceeds byte limit/)
  end

  it "accepts exactly 1 MiB and rejects the next byte and oversized valid exports" do
    row = item.merge(%w[external_id batch_id transaction_id original_reference terminal_id].to_h { |field| [ field, "x" * 128 ] })
      .merge("occurred_at" => "2026-10-27T14:01:02.123456Z")
    rows = Array.new(1000) { row.dup }
    remaining = described_class::MAX_BYTES - csv_for(*rows).bytesize
    expect(remaining).to be_between(1, 512_000)
    rows.each do |record|
      break if remaining.zero?

      bytes = [ remaining, 512 ].min
      record["description"] = "😀" * (bytes / 4) + "a" * (bytes % 4)
      remaining -= bytes
    end
    text = csv_for(*rows)
    expect(text.bytesize).to eq(described_class::MAX_BYTES)
    records = parse(text)[:records]
    expect(records.length).to eq(1000)
    expect { parse(text + "\n") }.to raise_error(described_class::Invalid, /exceeds byte limit/)
    expect(described_class.dump(records: records, context: context).bytesize).to eq(described_class::MAX_BYTES)
    oversized = read_record(row.merge("description" => "😀" * 128))
    expect { described_class.dump(records: [ oversized ] * 1000, context: context) }.to raise_error(described_class::Invalid, /exceeds output byte limit/)
  end

  it "emits only static row/field reasons, including CSV syntax failures" do
    secret = "sensitive-untrusted-source"
    [ csv_for(item.merge("entry_type" => secret)), CSV.generate_line(described_class::HEADERS) + "\"#{secret}" ].each do |text|
      expect { parse(text) }.to raise_error(described_class::Invalid) { |error|
        expect(error.message).to match(/\Arow 2 field [a-z_]+: /)
        expect(error.message).not_to include(secret)
      }
    end
  end

  it "dumps deterministic typed records, feeds context/version, validates the round trip and never mutates callers" do
    records = parse(csv_for(batch, item, deposit, allocation))[:records]
    supplied = records.map { |record| record.reject { |key, _| (described_class::CONTEXT_FIELDS + [ "schema_version" ]).include?(key) }.freeze }.freeze
    output = described_class.dump(records: supplied, context: context.freeze)
    expect(output.lines.first).to eq(described_class::HEADERS.join(",") + "\n")
    expect(parse(output)[:records]).to eq(records)
    expect(described_class.dump(records: supplied, context: context)).to eq(output)
    expect(supplied.first).not_to have_key("schema_version")
    expect(output).not_to start_with("\uFEFF")
    expect(described_class).to receive(:parse).with(output, context: context).and_call_original
    described_class.dump(records: records, context: context)
  end

  it "rejects conflicting dump scope/version, unknown keys and non-hash records" do
    record = read_record(item)
    { "account_id" => "7", "environment" => "production", "currency" => "EUR", "schema_version" => "v2" }.each do |field, value|
      [ value, nil, "" ].each do |conflict|
        expect { described_class.dump(records: [ record.merge(field => conflict) ], context: context) }.to raise_error(described_class::Invalid, /field #{field}:/)
      end
    end
    [ nil, [], { "extra" => "x" }, record.transform_keys(&:to_sym) ].each do |invalid|
      expect { described_class.dump(records: [ invalid ], context: context) }.to raise_error(described_class::Invalid)
    end
  end

  it "rejects dump floats, coercions, invalid strings and bounds, and requires a bounded array" do
    record = read_record(item)
    [ 29.0, "29", Rational(29), true, 2_147_483_648, -2_147_483_648 ].each do |value|
      expect { described_class.dump(records: [ record.merge("amount_cents" => value) ], context: context) }.to raise_error(described_class::Invalid)
    end
    [ 3.0, "3", 0, -1 ].each do |value|
      expect { described_class.dump(records: [ record.merge("location_id" => value) ], context: context) }.to raise_error(described_class::Invalid)
    end
    [ Object.new, 5, "\xFF".b ].each do |value|
      expect { described_class.dump(records: [ record.merge("description" => value) ], context: context) }.to raise_error(described_class::Invalid)
    end
    [ nil, [], [ record ] * 1001, {} ].each do |records|
      expect { described_class.dump(records: records, context: context) }.to raise_error(described_class::Invalid)
    end
  end
end
