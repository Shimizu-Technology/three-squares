require 'rails_helper'

RSpec.describe Payments::TerminalAdministrationAdapter do
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'sandbox', external_account_id: 'lane-fixture-account', external_acceptor_id: 'lane-fixture-acceptor', credential_reference: 'worldpay_default', profile_key: SecureRandom.uuid) }
  let(:location) { create(:location) }
  let(:user) { create(:user, :admin) }
  let(:profile) { PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'pos', presentation: 'worldpay_terminal', enabled: true) }
  let(:lane_wire) { JSON.generate('laneId' => 101, 'terminalId' => 'fixture-reader', 'serialNumber' => 'fixture-device', 'modelNumber' => 'Fixture model', 'connectionStatus' => {'status' => 'Connected', 'timeStamp' => '2026-10-27T00:00:00Z'}) }
  let(:env) { {'APP_DEPLOYMENT_ENV' => 'test', 'WORLDPAY_MODE' => 'sandbox', 'WORLDPAY_EXPRESS_ACCOUNT_ID' => identity.external_account_id, 'WORLDPAY_EXPRESS_ACCEPTOR_ID' => identity.external_acceptor_id, 'WORLDPAY_EXPRESS_ACCOUNT_TOKEN' => 'fictional-token', 'WORLDPAY_EXPRESS_APPLICATION_ID' => 'fictional-app', 'WORLDPAY_EXPRESS_APPLICATION_NAME' => 'Fixture', 'WORLDPAY_EXPRESS_APPLICATION_VERSION' => 'fixture'} }
  let(:transport) { double('offline lane transport', call: nil) }
  let(:client) { Payments::Worldpay::TriPosClient.new(configuration: Payments::Worldpay::TriPosConfiguration.new(identity: identity, env: env), transport: transport) }
  before do
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider HTTP forbidden' }
    allow(Payments::Worldpay::TriPosRuntime).to receive(:new).and_return(double(client: client))
  end
  def pair(key)
    Payments::ManageTerminal.call(user: user, profile: profile, location: location, lane_id: '101',
      terminal_reference: 'fixture-reader', label: 'Fixture reader', activation_code: 'fictional-code', operation_key: key, kind: 'pair')
  end
  it 'installs a successful published LaneDto without inventing a transaction error envelope' do
    expect(transport).to receive(:call).once.and_return(status: 200, headers: {}, body: lane_wire)
    operation = pair(SecureRandom.uuid)
    expect(operation.state).to eq('succeeded')
    expect(operation.payment_terminal).to have_attributes(lane_id: '101', terminal_id: 'fixture-reader', connection_state: 'connected')
    expect(operation.facts.to_json).not_to include('fictional-code')
  end
  it 're-pairs an existing reader without assigning its immutable location or terminal fields again' do
    allow(transport).to receive(:call).and_return(status: 200, headers: {}, body: lane_wire)
    first = pair(SecureRandom.uuid)
    second = pair(SecureRandom.uuid)
    expect(first.state).to eq('succeeded')
    expect(second.state).to eq('succeeded')
    expect(second.payment_terminal_id).to eq(first.payment_terminal_id)
    expect(PaymentTerminal.count).to eq(1)
  end

  it 'recovers a lost pair response by parsing the original lane query without a second pair' do
    requests = []
    allow(transport).to receive(:call) do |**request|
      requests << [request.fetch(:method), request.fetch(:path)]
      raise IOError, 'fictional lost response' if requests.one?
      {status: 200, headers: {}, body: lane_wire}
    end
    key = SecureRandom.uuid
    expect(pair(key).state).to eq('unknown')
    expect(PaymentTerminal.count).to eq(0)
    expect(pair(key).state).to eq('succeeded')
    expect(requests).to eq([[:post, '/cloudapi/v1/lanes'], [:get, '/cloudapi/v1/lanes/101']])
    expect(PaymentTerminal.count).to eq(1)
  end
  it 'does not install a lane from an inconsistent or failed optional error envelope' do
    body = JSON.generate(JSON.parse(lane_wire).merge('_hasErrors' => true, '_errors' => [{}]))
    allow(transport).to receive(:call).and_return(status: 200, headers: {}, body: body)
    expect(pair(SecureRandom.uuid).state).to eq('unknown')
    expect(PaymentTerminal.count).to eq(0)
  end
end
