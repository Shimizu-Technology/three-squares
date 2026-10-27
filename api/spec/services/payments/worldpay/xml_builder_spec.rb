require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::XmlBuilder do
  include_context "offline Worldpay client contracts"
  let(:builder) { described_class.new(configuration: configuration, contract: wire_contract) }

  it "writes escaped credentials/application/fields, namespaces, exact money and a direct root GUID" do
    config = configuration(credentials: credentials.merge("AccountToken" => "fixture-token<&\""))
    fields = { "Transaction" => { "ReferenceNumber" => "order<&\"'雪" } }
    wire = described_class.new(configuration: config, contract: wire_contract).build(method: "CreditCardSale", fields: fields, amount_cents: 29, idempotency_key: WorldpayClientContractSupport::ID)
    root = Nokogiri::XML(wire).root
    expect(root.namespace.href).to eq(namespaces[:transaction])
    expect(root.element_children.find { |child| child.name == "IdempotencyKey" }.text).to eq(WorldpayClientContractSupport::ID)
    expect(root.xpath(".//*[local-name()='IdempotencyKey']").length).to eq(1)
    expect(root.at_xpath(".//*[local-name()='AccountToken']").text).to eq("fixture-token<&\"")
    expect(root.at_xpath(".//*[local-name()='ReferenceNumber']").text).to eq("order<&\"'雪")
    expect(root.at_xpath(".//*[local-name()='TransactionAmount']").text).to eq("0.29")
    expect(wire).to include("&lt;", "&amp;")
    expect(fields).to eq("Transaction" => { "ReferenceNumber" => "order<&\"'雪" })
  end

  it "preserves integer cents at boundaries using existing Money" do
    [ 1, 29, 2305, Payments::Worldpay::Money::MAX_CENTS ].each do |amount|
      wire = builder.build(method: "CreditCardSale", fields: transaction_fields, amount_cents: amount, idempotency_key: WorldpayClientContractSupport::ID)
      expect(wire).to include("<TransactionAmount>#{Payments::Worldpay::Money.format(amount)}</TransactionAmount>")
    end
    [ 1.2, "100", -1, 0, Payments::Worldpay::Money::MAX_CENTS + 1 ].each do |amount|
      expect { builder.build(method: "CreditCardSale", fields: transaction_fields, amount_cents: amount, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Money::Invalid)
    end
  end

  it "allowlists roots and interface routes" do
    described_class::TRANSACTION_METHODS.each { |method| expect(described_class.interface(method)).to eq(:transaction) }
    expect(described_class.interface("TransactionQueryPagination")).to eq(:reporting)
    described_class::SERVICES_METHODS.each { |method| expect(described_class.interface(method)).to eq(:services) }
    %w[TransactionQuery Arbitrary SOAP CreditCardCredit].each do |method|
      expect { described_class.interface(method) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "unsupported_express_method")
    end
  end

  it "requires GUID idempotency at every Transaction root and forbids it elsewhere" do
    [ nil, "key", "123", "{#{WorldpayClientContractSupport::ID}}", "#{WorldpayClientContractSupport::ID}\n" ].each do |key|
      expect { builder.build(method: "CreditCardSale", fields: transaction_fields, amount_cents: 100, idempotency_key: key) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    end
    %w[TransactionQueryPagination PaymentAccountQuery].each do |method|
      expect { builder.build(method: method, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "idempotency_not_supported_on_interface")
    end
  end

  it "rejects raw card fields, handles, unknown fields, raw XML and profile/amount/return overrides" do
    [ { "Card" => { "CardNumber" => "forbidden" } }, { "Transaction" => { "OpaqueHandle" => "browser-handle" } },
      { "Transaction" => { "Future" => "value" } }, { "Terminal" => { "TerminalID" => "other-terminal" } },
      { "Transaction" => { "TransactionAmount" => "2.00" } }, "<Transaction/>" ].each do |fields|
      expect { builder.build(method: "CreditCardSale", fields: fields, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    end
    fields = transaction_fields.merge("TransactionSetup" => { "ReturnURL" => "https://attacker.test/" })
    expect { builder.build(method: "TransactionSetup", fields: fields, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
  end

  it "rejects unsafe wire allowlists and missing approved indicator contracts" do
    [ "CardNumber", "PAN", "AccountToken", "OpaqueHandle", "X><Y", "CVV" ].each do |field|
      expect { described_class.new(configuration: configuration, contract: { "CreditCardSale" => { fields: { "Transaction" => [ field ] } } }) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    end
    contract = wire_contract
    contract["CreditCardSale"][:required_profile_paths] << [ "Terminal", "TerminalCapabilityCode" ]
    expect { described_class.new(configuration: configuration, contract: contract) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    contract = wire_contract
    contract["CreditCardSale"][:required_profile_paths] = []
    expect { described_class.new(configuration: configuration, contract: contract).build(method: "CreditCardSale", fields: transaction_fields, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "terminal_profile_contract_required")
  end

  it "requires the integer money parameter even when caller-supplied wire money looks valid" do
    %w[1.00 1e2 1.001].each do |amount|
      fields = transaction_fields.transform_values(&:dup)
      fields["Transaction"]["TransactionAmount"] = amount
      expect { builder.build(method: "CreditCardVoid", fields: fields, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "integer_amount_parameter_required")
    end
  end

  it "bounds request size and does not retain mutable contract inputs" do
    contract = wire_contract
    instance = described_class.new(configuration: configuration, contract: contract)
    contract["CreditCardSale"][:fields]["Transaction"] << "Future"
    expect { instance.build(method: "CreditCardSale", fields: { "Transaction" => { "Future" => "value" } }, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid)
    expect { instance.build(method: "CreditCardSale", fields: { "Transaction" => { "ReferenceNumber" => "x" * 2049 } }, amount_cents: 100, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "invalid_wire_value")
    names = 40.times.map { |number| "Field#{number}" }
    contract = { "BatchClose" => { fields: { "Batch" => names } } }
    large = names.to_h { |name| [ name, "x" * 2048 ] }
    expect { described_class.new(configuration: configuration, contract: contract).build(method: "BatchClose", fields: { "Batch" => large }, idempotency_key: WorldpayClientContractSupport::ID) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "request_size_limit")
  end
end
