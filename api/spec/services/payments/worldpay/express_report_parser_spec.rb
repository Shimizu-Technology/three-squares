require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::ExpressReportParser do
  include_context "offline Worldpay client contracts"

  def parse(xml, contract: report_contract)
    described_class.call(xml, configuration: configuration, contract: contract)
  end

  it "retains reported facts and unknown status without treating query success as capture" do
    result = parse(report_xml(rows: report_row(state: "Captured", extra: "<Future>do-not-retain</Future>")))
    expect(result).to include(status: "unknown", page: 1, page_count: 1, total_count: 1)
    row = result[:rows].first
    expect(row).to include(status: "unknown", raw_id: "transaction-1", requested_cents: nil, approved_cents: nil, captured_cents: nil)
    expect(row[:metadata]).to include(provider_status: "Captured", reported_amount_cents: 29, reported_currency: "USD", unknown_fields: [ "Future" ])
    expect(result.inspect).not_to include("do-not-retain")
  end

  it "accepts empty, multiple, nested, escaped and CDATA ReportingData using explicit paths" do
    expect(parse(report_xml(rows: "", total: 0))[:rows]).to eq([])
    rows = report_row + report_row(id: "transaction-2")
    [ false, true ].each do |embedded|
      expect(parse(report_xml(rows: rows, total: 2, embedded: embedded))[:rows].map { |row| row[:raw_id] }).to eq(%w[transaction-1 transaction-2])
    end
    escaped = report_xml(rows: "", total: 1).sub("<Transactions></Transactions>", "&lt;Report&gt;&lt;Transactions&gt;#{report_row.gsub('&', '&amp;').gsub('<', '&lt;').gsub('>', '&gt;')}&lt;/Transactions&gt;&lt;/Report&gt;")
    expect(parse(escaped)[:rows].length).to eq(1)
    nested = report_xml.sub("<Transactions>", "<Wrapper><Transactions>").sub("</Transactions>", "</Transactions></Wrapper>")
    expect(parse(nested, contract: report_contract.merge(rows_path: %w[Wrapper Transactions Transaction]))[:rows].length).to eq(1)
  end

  it "retains unsupported currency/status as unclassified facts without inventing money" do
    row = parse(report_xml.sub("<CurrencyCode>USD</CurrencyCode>", "<CurrencyCode>EUR</CurrencyCode>"))[:rows].first
    expect(row[:metadata]).to include(reported_currency: "EUR", reported_amount_cents: nil, provider_status: "UnexpectedVendorState")
    expect(row[:captured_cents]).to be_nil
  end

  it "rejects invalid amounts, duplicate scalars/containers, count contradictions, missing codes and namespace spoofing" do
    wire = report_xml
    [ wire.sub("0.29", "1.001"), wire.sub("0.29", "1e2"), wire.sub("</Response>", "<ReportingData/></Response>"),
      wire.sub("</Transaction>", "<TransactionID>second</TransactionID></Transaction>"),
      wire.sub("<TotalCount>1</TotalCount>", "<TotalCount>0</TotalCount>"),
      wire.sub("<PageCount>1</PageCount>", "<PageCount>1001</PageCount>"),
      wire.sub("<PageNumber>1</PageNumber>", "<PageNumber>0</PageNumber>"),
      wire.sub("<PageNumber>1</PageNumber>", "<PageNumber>2</PageNumber>"),
      wire.sub("<ExpressResponseCode>0</ExpressResponseCode>", ""),
      wire.sub("<ExpressResponseCode>0", "<ExpressResponseCode>00-host"),
      wire.sub("<TransactionID>", '<TransactionID xmlns="urn:evil">') ].each do |input|
      expect(parse(input)).to include(status: "unknown", rows: [], complete: false)
      expect(parse(input).dig(:metadata, :parse_error)).not_to be_nil
    end
  end

  it "bounds XML nodes/rows, encoded report XML, scalar names and sizes" do
    [ "x" * 65_537, "<broken", report_xml(rows: "<Transaction/>" * 1001, total: 1001),
      report_xml.sub("</Response>", "<#{'X' * 65}/></Response>"),
      report_xml.sub("transaction-1", "x" * 257),
      report_xml(rows: "<![CDATA[<!DOCTYPE x SYSTEM 'https://invalid.example/dtd'><Report/>]]>") ].each do |input|
      expect(parse(input)[:metadata][:parse_error]).not_to be_nil
    end
  end

  it "requires explicit report/count/transaction mappings and rejects query failures" do
    [ {}, report_contract.except(:pages_path), report_contract.merge(fields: {}), report_contract.merge(page_path: [ "../Unsafe" ]) ].each do |contract|
      expect(parse(report_xml, contract: contract)[:metadata][:parse_error]).not_to be_nil
    end
    expect(parse(report_xml.sub("<ExpressResponseCode>0", "<ExpressResponseCode>1002"))[:rows]).to eq([])
    expect(parse(report_xml.sub("transaction-1", credentials["AccountToken"]))[:metadata][:parse_error]).to eq("sensitive_response")
  end

  it "rejects unexpected row layouts rather than interpreting them as an empty report" do
    [ report_xml.sub("<Transactions>", "<Other>").sub("</Transactions>", "</Other>"),
      report_xml.sub("</Transactions>", "<UnmappedTransaction/></Transactions>") ].each do |xml|
      expect(parse(xml)[:metadata][:parse_error]).to eq("unexpected_report_structure")
    end
  end

  it "never normalizes an unverified financial response into captured or refunded" do
    contract = row_contract.transform_values { |path| [ "Transaction" ] + path }
    %w[CreditCardSale CreditCardReturn CreditCardVoid CreditCardReversal CreditCardAuthorizationCompletion].each do |method|
      xml = envelope(method, report_row(state: "Captured", amount: "23.05"))
      result = described_class.observe(xml, configuration: configuration, method: method, contract: contract)
      expect(result).to include(status: "unknown", raw_id: "transaction-1", captured_cents: nil)
      expect(result[:metadata]).to include(contract_verified: false, reported_amount_cents: 2305, provider_status: "Captured")
    end
  end
end
