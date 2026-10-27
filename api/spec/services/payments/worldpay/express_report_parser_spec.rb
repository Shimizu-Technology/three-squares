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

  context "with the original-setup query contract" do
    def query_parse(xml)
      described_class.query(xml, configuration: published_report_configuration, contract: Payments::Worldpay::PublishedContract.report_contract)
    end

    def query_xml(code: "0", data: "<ReportingData><Items>#{published_item}</Items></ReportingData>")
      "<TransactionQueryResponse xmlns=\"https://reporting.elementexpress.com\"><Response><ExpressResponseCode>#{code}</ExpressResponseCode>#{data}</Response></TransactionQueryResponse>"
    end

    it "keeps recognized reporting failures without transaction evidence retryable" do
      [ "", "<ReportingData/>", "<ReportingData><Items/></ReportingData>",
        "<ReportingData><![CDATA[<Items/>]]></ReportingData>" ].each do |data|
        %w[1001 1002 30].each do |code|
          result = query_parse(query_xml(code: code, data: data))
          expect(result).to include(status: "unknown", complete: false, rows: [])
          expect(result[:metadata]).to include(parse_error: "report_query_not_successful", financial_ambiguity: false)
        end
      end
    end

    it "retains non-authorizing financial evidence even inside a failed query envelope" do
      result = query_parse(query_xml(code: "1001"))
      expect(result).to include(status: "unknown", complete: false)
      expect(result[:rows].map { |entry| entry[:raw_id] }).to eq([ "transaction-1" ])
      expect(result[:metadata]).to include(parse_error: "report_query_not_successful", financial_ambiguity: true)
      malformed = query_parse(query_xml(code: "1002", data: "<ReportingData><Items>#{published_item}<Item><TransactionID/></Item></Items></ReportingData>"))
      expect(malformed.dig(:metadata, :financial_ambiguity)).to be(true)
      expect(malformed[:rows].map { |entry| entry[:raw_id] }).to include("transaction-1")
    end

    it "does not treat malformed or uninspectable transaction data as an empty failed query" do
      [ "<broken", query_xml(code: "1001", data: "<ReportingData><Unexpected><Item/></Unexpected></ReportingData>") ].each do |xml|
        expect(query_parse(xml).dig(:metadata, :financial_ambiguity)).to be(true)
      end
    end

    it "rejects CDATA outside the explicit embedded XML path before declaring a query empty" do
      tainted = "<![CDATA[<Item><TransactionID>possible-charge</TransactionID></Item>]]>"
      embedded = "<Items>#{tainted}</Items>".gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;")
      [ "<ReportingData><Items>#{tainted}</Items></ReportingData>",
        "<ReportingData>#{tainted}<Items/></ReportingData>",
        "<ReportingData>#{embedded}</ReportingData>" ].each do |data|
        %w[0 1001].each do |code|
          result = query_parse(query_xml(code: code, data: data))
          expect(result).to include(status: "unknown", complete: false, rows: [])
          expect(result[:metadata]).to include(financial_ambiguity: true)
          expect(result.dig(:metadata, :parse_error)).not_to be_nil
        end
      end
      empty = query_parse(query_xml(code: "1001", data: "<ReportingData><Items><![CDATA[ \n ]]></Items></ReportingData>"))
      expect(empty.dig(:metadata, :financial_ambiguity)).to be(false)
    end
  end

  context "with the published per-Item count contract" do
    def published_parse(xml, requested_page: 1, contract: Payments::Worldpay::PublishedContract.report_contract)
      described_class.call(xml, configuration: published_report_configuration, contract: contract, requested_page: requested_page)
    end

    it "retains primary-backed non-sensitive row facts without inferring currency, cents or success" do
      extra = "<CurrencyCode>USD</CurrencyCode><Future>discard-this-value</Future><CardNumberMasked>discard-card</CardNumberMasked>" \
        "<ExpirationMonth>discard-expiry</ExpirationMonth><PaymentAccountID>discard-token</PaymentAccountID>"
      result = published_parse(published_page_xml(rows: published_item(extra: extra)))
      expect(result).to include(status: "unknown", complete: false, page: 1, page_count: 1, total_count: 1)
      row = result[:rows].fetch(0)
      expect(row).to include(raw_id: "transaction-1", reference_number: "order-1", status: "unknown", requested_cents: nil,
        approved_cents: nil, captured_cents: nil, currency: nil)
      expect(row[:metadata]).to include(account_id: credentials["AccountID"], acceptor_id: credentials["AcceptorID"], terminal_id: "fixture-terminal",
        approval_number: "fixture-approval", express_response_code: "0", transaction_type: "fixture-type", status_code: "fixture-status",
        provider_status: "Approved", reported_amount: "23.05", reported_currency: nil, reported_amount_cents: nil, contract_verified: false)
      expect(row[:metadata][:unknown_fields]).to include("CurrencyCode", "Future", "CardNumberMasked", "ExpirationMonth", "PaymentAccountID")
      expect(row[:metadata][:unknown_fields]).not_to include("CurrentPageNumber", "MaxPageCount", "MaxRows")
      expect(result.inspect).not_to include("discard-this-value", "discard-card", "discard-expiry", "discard-token")
    end

    it "accepts the known direct, escaped Items and CDATA ReportingData shapes" do
      [ nil, :escaped, :cdata ].each do |embedded|
        result = published_parse(published_page_xml(embedded: embedded))
        expect(result[:metadata][:parse_error]).to be_nil
        expect(result[:rows].map { |row| row[:raw_id] }).to eq([ "transaction-1" ])
      end
      namespaced = published_page_xml(embedded: :cdata).sub("<![CDATA[<ReportingData>", '<![CDATA[<ReportingData xmlns="https://reporting.elementexpress.com">')
      expect(published_parse(namespaced)[:rows].length).to eq(1)
      empty_approval = published_page_xml.sub("<ApprovalNumber>fixture-approval</ApprovalNumber>", "<ApprovalNumber/>")
      expect(published_parse(empty_approval)[:rows].first[:metadata]).not_to have_key(:approval_number)
    end

    it "requires every row to agree on all three counts and the fixed page shape" do
      wire = published_page_xml(total: 2)
      [ wire.sub("<CurrentPageNumber>1", "<CurrentPageNumber>2"), wire.sub("<MaxPageCount>1", "<MaxPageCount>2"),
        wire.sub("<MaxRows>2", "<MaxRows>3"), wire.gsub("<MaxPageCount>1", "<MaxPageCount>2"),
        wire.gsub("<MaxRows>2", "<MaxRows>3"), wire.sub("<MaxRows>2</MaxRows>", ""),
        wire.sub("<MaxRows>2", "<MaxRows>02"), wire.sub("<MaxRows>2", "<MaxRows>1000001"),
        published_page_xml(page: 1, total: 1001, rows: published_item(total: 1001, pages: 2)),
        wire.sub("</Item>", "<MaxRows>2</MaxRows></Item>") ].each do |xml|
        result = published_parse(xml)
        expect(result).to include(complete: false, rows: [])
        expect(result.dig(:metadata, :parse_error)).not_to be_nil
      end
    end

    it "checks the requested page exactly and requires a nonempty unique ID on every row" do
      [ nil, 0, 1001, "1", 1.0 ].each do |page|
        expect(published_parse(published_page_xml, requested_page: page)[:metadata][:parse_error]).to eq("requested_report_page_required")
      end
      expect(published_parse(published_page_xml(page: 2, total: 1001))[:metadata][:parse_error]).to eq("unexpected_report_page")
      wire = published_page_xml(total: 2)
      [ wire.sub("transaction-2", "transaction-1"), wire.sub("<TransactionID>transaction-1</TransactionID>", ""),
        wire.sub("<TransactionID>transaction-1</TransactionID>", "<TransactionID/>"),
        wire.sub("transaction-1", " x "), wire.sub("transaction-1", "x" * 257),
        wire.sub("</Item>", "<TransactionID>another</TransactionID></Item>") ].each do |xml|
        expect(published_parse(xml)).to include(complete: false, rows: [])
      end
    end

    it "does not use response-level counts to certify an empty report" do
      empty = published_page_xml(total: 0, rows: "").sub("<ReportingData>", "<CurrentPageNumber>1</CurrentPageNumber><MaxPageCount>1</MaxPageCount><MaxRows>0</MaxRows><ReportingData>")
      expect(published_parse(empty)).to include(complete: false, rows: [], page: nil, page_count: nil, total_count: nil)
      expect(published_parse(empty)[:metadata][:parse_error]).to eq("report_count_proof_required")
    end

    it "rejects unknown direct or embedded shapes, mixed namespaces, nested scalars and embedded DTDs" do
      direct = published_page_xml
      cdata = published_page_xml(embedded: :cdata)
      [ direct.sub("<Items>", "<Other>").sub("</Items>", "</Other>"),
        direct.sub("</Items>", "<Other/></Items>"), direct.sub("<Items>", "unexpected<Items>"),
        direct.sub("</Items>", "</Items><Items/>"), direct.sub("<Item>", '<Item xmlns="urn:spoof">'),
        direct.sub("fixture-terminal</TerminalID>", "<Nested/></TerminalID>"),
        cdata.sub("<![CDATA[<ReportingData>", '<![CDATA[<ReportingData xmlns="urn:spoof">'),
        cdata.sub("<![CDATA[<ReportingData>", "<![CDATA[<Other>").sub("</ReportingData>]]>", "</Other>]]>"),
        cdata.sub("<![CDATA[", "<![CDATA[<!DOCTYPE ReportingData [<!ENTITY x SYSTEM 'https://invalid.example/entity'>]>") ].each do |xml|
        expect(published_parse(xml)).to include(complete: false, rows: [])
        expect(published_parse(xml).dig(:metadata, :parse_error)).not_to be_nil
      end
    end

    it "parses full 1000-row pages above 64 KiB within the reporting node budget" do
      [ nil, :cdata ].each do |embedded|
        xml = published_page_xml(total: 1000, embedded: embedded)
        expect(xml.bytesize).to be > Payments::Worldpay::Configuration::MAX_BYTES
        result = published_parse(xml)
        expect(result[:metadata][:parse_error]).to be_nil
        expect(result[:rows].length).to eq(1000)
      end
    end

    it "bounds reporting bytes, nodes, children and depth for direct and embedded documents" do
      max_bytes = Payments::Worldpay::Configuration::MAX_REPORT_BYTES
      node_heavy = Array.new(1000, "<N>#{'<N/>' * 200}</N>").join
      expect(published_parse("x" * (max_bytes + 1)).dig(:metadata, :parse_error)).to eq("invalid_xml_size")
      expect(published_parse(published_page_xml(rows: "<Item/>" * 1001)).dig(:metadata, :parse_error)).to eq("xml_child_limit")
      [ nil, :cdata ].each do |embedded|
        nodes = published_page_xml(rows: published_item(extra: "<Extra>#{node_heavy}</Extra>"), embedded: embedded)
        expect(published_parse(nodes).dig(:metadata, :parse_error)).to eq("xml_node_limit")
        depth = published_page_xml(rows: published_item(extra: "#{'<N>' * 16}#{'</N>' * 16}"), embedded: embedded)
        expect(published_parse(depth).dig(:metadata, :parse_error)).to eq("xml_depth_limit")
      end
    end

    it "keeps the shared Transaction reader at 64 KiB and 4096 nodes" do
      xml = Payments::Worldpay::HppSetup::Xml
      expect { xml.parse("<Root>#{'x' * 65_536}</Root>") }.to raise_error(xml::Invalid, "invalid_xml_size")
      nodes = "<Root>#{Array.new(10, "<N>#{'<N/>' * 500}</N>").join}</Root>"
      expect(nodes.bytesize).to be < Payments::Worldpay::Configuration::MAX_BYTES
      expect { xml.parse(nodes) }.to raise_error(xml::Invalid, "xml_node_limit")
      expect(xml.parse(nodes, interface: :reporting).name).to eq("Root")
    end

    it "refuses sensitive field aliases and authentication token echoes" do
      contract = Payments::Worldpay::PublishedContract.report_contract
      %w[CardNumber ExpirationYear PaymentAccountID TokenID PAN TrackData CVV].each do |name|
        expect(published_parse(published_page_xml, contract: contract.merge(fields: contract[:fields].merge(raw_id: [ name ])))[:metadata][:parse_error]).to eq("invalid_observation_contract")
      end
      expect(published_parse(published_page_xml.sub("fixture-approval", credentials["AccountToken"]))[:metadata][:parse_error]).to eq("sensitive_response")
      expect(published_parse(published_page_xml.sub(credentials["AccountID"], credentials["AccountToken"]))[:metadata][:parse_error]).to eq("sensitive_response")
    end

    it "rejects incomplete or malformed published contracts without reading the response" do
      contract = Payments::Worldpay::PublishedContract.report_contract
      [ contract.except(:embedded_roots), contract.merge("extra" => []), contract.merge(item_count_paths: { page: [ "CurrentPageNumber" ], pages: [ "MaxPageCount" ], "total" => [ "MaxRows" ] }),
        contract.merge(fixed_page_size: 999), contract.merge(embedded_roots: {}), contract.merge(embedded_roots: { "Bad/Root" => [ "Item" ] }),
        contract.merge(fields: contract[:fields].except(:raw_id)) ].each do |mapping|
        result = published_parse("unused", contract: mapping)
        expect(result).to include(complete: false, rows: [])
        expect(result.dig(:metadata, :parse_error)).not_to be_nil
      end
    end
  end
end
