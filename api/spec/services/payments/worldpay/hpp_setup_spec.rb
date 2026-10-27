require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::HppSetup do
  include_context "offline Worldpay client contracts"

  def parse(xml, presentation: "legacy", contract: setup_contract)
    described_class.parse(xml, configuration: configuration, presentation: presentation, contract: contract)
  end

  it "separates legacy setup ID and hosted URL, and keeps validation code server-only" do
    result = parse(setup_xml)
    expect(result.status).to eq("ready")
    expect(result.setup_id).to eq(WorldpayClientContractSupport::ID)
    expect(result.hosted_url).to eq(configuration.hosted_url(WorldpayClientContractSupport::ID))
    expect(result.validation_code).to eq("fixture-validation")
    expect(result.to_h.inspect + result.inspect).not_to include("fixture-validation")
    expect(result.valid_return_code?("fixture-validation")).to be(true)
    [ "wrong", nil, "x" * 257 ].each { |value| expect(result.valid_return_code?(value)).to be(false) }
  end

  it "uses the full allowlisted Premium URL without deriving a setup ID or replacing its host" do
    url = "https://payments-test.worldpay.com/hosted/#{'x' * 300}?opaque=fixture"
    result = parse(setup_xml(setup_id: url.gsub("&", "&amp;")), presentation: "premium")
    expect(result.status).to eq("ready")
    expect(result.hosted_url).to eq(url)
    expect(result.setup_id).to be_nil
    expect(parse(setup_xml(setup_id: WorldpayClientContractSupport::ID), presentation: "premium").status).to eq("unknown")
  end

  it "accepts a separate Premium identifier only through explicit response paths" do
    contract = setup_contract.merge(hosted_url_path: %w[TransactionSetup HostedURL])
    result = parse(setup_xml(extra: "<HostedURL>https://payments-test.worldpay.com/hosted/fixture</HostedURL>"), presentation: "premium", contract: contract)
    expect(result.status).to eq("ready")
    expect(result.setup_id).to eq(WorldpayClientContractSupport::ID)
    ambiguous = setup_contract.merge(validation_code_path: setup_contract[:setup_id_path])
    expect(parse(setup_xml, contract: ambiguous).status).to eq("unknown")
  end

  [ "http://payments-test.worldpay.com/", "https://payments-test.worldpay.com.attacker.test/", "https://user:pass@payments-test.worldpay.com/",
    "https://payments-test.worldpay.com:444/", "https://payments.worldpay.com/", "https://payments-test.worldpay.com/#fragment" ].each do |url|
    it "rejects unapproved Premium URL #{url}" do
      expect(parse(setup_xml(setup_id: url), presentation: "premium").status).to eq("unknown")
    end
  end

  it "fails closed on declined setup, missing validation, invalid legacy ID and secret echoes" do
    [ setup_xml(code: "20"), setup_xml(validation: ""), setup_xml(setup_id: "not-a-guid"), setup_xml(validation: credentials["AccountToken"]) ].each do |xml|
      result = parse(xml)
      expect(result.status).to eq("unknown")
      expect(result.setup_id).to be_nil
      expect(result.to_h.inspect).not_to include(credentials["AccountToken"])
    end
  end

  it "rejects malformed, ambiguous, deeply nested, oversized and mixed-namespace XML" do
    wire = setup_xml
    inputs = [ "<broken", wire + "<root/>", wire.encode("UTF-16LE"), "x" * 65_537,
      wire.sub("</Response>", "<TransactionSetup/></Response>"), wire.sub("</Response>", "<ExpressResponseCode>0</ExpressResponseCode></Response>"),
      wire.sub("<ValidationCode>", '<ValidationCode xmlns="urn:evil">'), wire.sub("fixture-validation", "<Nested>invalid</Nested>"),
      wire.sub("</Response>", "#{'<X>' * 20}deep#{'</X>' * 20}</Response>") ]
    inputs.each { |input| expect(parse(input).status).to eq("unknown") }
  end

  it "rejects all DTD/entity expansion locally before any external access" do
    [ '<!DOCTYPE x SYSTEM "https://invalid.example/dtd">', '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///nonexistent-fixture">]>', '<!DOCTYPE x [<!ENTITY bomb "expand">]>' ].each do |declaration|
      result = parse(declaration + setup_xml)
      expect(result.metadata[:parse_error]).to eq("unsafe_xml")
    end
    expect(parse(setup_xml(validation: "&undefined;")).status).to eq("unknown")
  end

  it "preserves unknown field paths without their values" do
    result = parse(setup_xml(extra: "<Future>secret-do-not-retain</Future>"))
    expect(result.metadata[:unknown_fields]).to include("Response/TransactionSetup/Future")
    expect(result.to_h.inspect).not_to include("secret-do-not-retain")
  end

  it "detects secret echoes before Ruby inspection can escape quotes or backslashes" do
    config = configuration(credentials: credentials.merge("AccountToken" => 'fixture-token"with\\escaping'))
    xml = setup_xml(validation: 'fixture-token&quot;with\\escaping')
    result = described_class.parse(xml, configuration: config, presentation: "legacy", contract: setup_contract)
    expect(result.metadata[:parse_error]).to eq("sensitive_response")
    expect(result.validation_code).to be_nil
  end
end
