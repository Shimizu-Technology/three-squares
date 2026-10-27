require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::ExpressTransport do
  include WorldpayClientContractSupport

  # Deliberately constructor-only: ExpressTransport#call is never invoked here.
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
end
