require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::ExpressTransport do
  include WorldpayClientContractSupport

  # Calls below use an entirely mocked HTTP connection; no sockets are opened.
  it "constructs without I/O and redacts its configuration in inspect" do
    expect(Net::HTTP).not_to receive(:new)
    expect(described_class.new(configuration: configuration).inspect).not_to include(*credentials.values)
  end

  it "requires finite positive bounded open/read/write/total timeouts" do
    %i[open_timeout read_timeout write_timeout total_timeout].each do |key|
      [ 0, -1, 31, Float::INFINITY, Float::NAN, "10", nil ].each do |value|
        expect { described_class.new(configuration: configuration, **{ key => value }) }.to raise_error(Payments::Worldpay::Configuration::Invalid, "invalid_transport_timeout")
      end
    end
  end

  def mock_http(chunks:, content_length: nil)
    response = double("offline response", code: "200")
    allow(response).to receive(:[]).with("Content-Encoding").and_return(nil)
    allow(response).to receive(:[]).with("Content-Length").and_return(content_length)
    allow(response).to receive(:read_body) { |&block| chunks.each(&block) }
    http = instance_double(Net::HTTP)
    %i[use_ssl= verify_mode= verify_hostname= min_version= open_timeout= read_timeout= write_timeout= max_retries=].each do |writer|
      allow(http).to receive(writer)
    end
    allow(http).to receive(:start).and_yield(http)
    allow(http).to receive(:request).with(instance_of(Net::HTTP::Post)).and_yield(response)
    allow(Net::HTTP).to receive(:new).and_return(http)
    http
  end

  it "allows bounded Reporting bodies above 64 KiB through mocked HTTP while keeping Transaction capped" do
    body = "x" * (Payments::Worldpay::Configuration::MAX_BYTES + 1)
    http = mock_http(chunks: [ body ], content_length: body.bytesize.to_s)
    transport = described_class.new(configuration: published_report_configuration)
    expect(transport.call(interface: :reporting, body: "<request/>")).to eq(body)
    expect(http).to have_received(:verify_mode=).with(OpenSSL::SSL::VERIFY_PEER)
    expect(http).to have_received(:verify_hostname=).with(true)
    expect(http).to have_received(:max_retries=).with(0)
    expect { transport.call(interface: :transaction, body: "<request/>") }.to raise_error(described_class::Error, "response_size_limit")
  end

  it "enforces interface-specific size limits both from headers and streaming chunks" do
    transport = described_class.new(configuration: published_report_configuration)
    { reporting: Payments::Worldpay::Configuration::MAX_REPORT_BYTES, transaction: Payments::Worldpay::Configuration::MAX_BYTES }.each do |interface, limit|
      mock_http(chunks: [ "unused" ], content_length: (limit + 1).to_s)
      expect { transport.call(interface: interface, body: "<request/>") }.to raise_error(described_class::Error, "response_size_limit")
      mock_http(chunks: [ "x" * limit, "x" ])
      expect { transport.call(interface: interface, body: "<request/>") }.to raise_error(described_class::Error, "response_size_limit")
      mock_http(chunks: [ "x" * limit ], content_length: limit.to_s)
      expect(transport.call(interface: interface, body: "<request/>").bytesize).to eq(limit)
    end
  end

  it "validates interface, namespace and request size before constructing HTTP" do
    expect(Net::HTTP).not_to receive(:new)
    transport = described_class.new(configuration: published_report_configuration)
    expect { transport.call(interface: :unknown, body: "<request/>") }.to raise_error(Payments::Worldpay::Configuration::Invalid, "invalid_interface")
    expect { transport.call(interface: :services, body: "<request/>") }.to raise_error(Payments::Worldpay::Configuration::Invalid, "interface_namespace_required")
    expect { transport.call(interface: :reporting, body: "x" * 65_537) }.to raise_error(described_class::Error, "invalid_request_body")
  end
end
