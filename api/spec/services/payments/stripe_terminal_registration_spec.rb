require 'rails_helper'

RSpec.describe 'Registration of an existing Stripe reader' do
  let(:identity) { PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_registration_fixture', credential_reference: 'stripe_default', profile_key: SecureRandom.uuid) }
  let(:location) { create(:location) }
  let(:user) { create(:user, :admin) }
  let(:profile) { PaymentProfile.create!(payment_identity: identity, provider: 'stripe', channel: 'pos', presentation: 'stripe_terminal', location: location, capabilities: {'stripe_terminal_location_id' => 'tml_fixture'}, enabled: true) }
  let(:readers) { double('read-only registered readers') }
  let(:reader) { Stripe::Terminal::Reader.construct_from(id: 'tmr_fixture', location: 'tml_fixture', livemode: false, serial_number: 'fixture-serial', device_type: 'stripe_s700', device_sw_version: 'fixture-version', status: 'online') }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('STRIPE_SECRET_KEY_TEST').and_return('sk_test_fictional_fixture')
    allow(Stripe::StripeClient).to receive(:new).with('sk_test_fictional_fixture', stripe_account: identity.external_account_id).and_return(double(v1: double(terminal: double(readers: readers))))
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider HTTP forbidden' }
  end
  def register(key = SecureRandom.uuid, lane: 'stripe-local-lane')
    Payments::ManageTerminal.call(user: user, profile: profile, location: location, lane_id: lane,
      terminal_reference: 'tmr_fixture', label: 'Registered fixture', operation_key: key, kind: 'pair')
  end
  it 'verifies the original account/location/mode without creating or deleting a reader at Stripe' do
    expect(readers).to receive(:retrieve).with('tmr_fixture').and_return(reader)
    operation = register
    expect(operation.state).to eq('succeeded')
    expect(operation.payment_terminal).to have_attributes(terminal_id: 'tmr_fixture', device_serial: 'fixture-serial', connection_state: 'connected')
    expect(operation.facts.dig('profile', 'location_id')).to eq(location.id)
  end
  it 'rejects a registered reader in a different location or processor mode' do
    reader.location = 'tml_other'
    allow(readers).to receive(:retrieve).and_return(reader)
    expect(register.state).to eq('failed')
    expect(PaymentTerminal.count).to eq(0)
    reader.location = 'tml_fixture'; reader.livemode = true
    expect(register.state).to eq('failed')
    expect(PaymentTerminal.count).to eq(0)
  end
  it 'recovers a lost registration lookup by querying the same reader without any mutation' do
    calls = 0
    allow(readers).to receive(:retrieve).with('tmr_fixture') { calls += 1; raise IOError, 'fictional lost lookup' if calls == 1; reader }
    key = SecureRandom.uuid
    expect(register(key).state).to eq('unknown')
    expect(register(key).state).to eq('succeeded')
    expect(calls).to eq(2)
    expect(PaymentTerminal.count).to eq(1)
  end
  it 'rejects an alias lane for the same registered reader before any provider request' do
    expect(readers).to receive(:retrieve).once.with('tmr_fixture').and_return(reader)
    original = register.payment_terminal
    expect(original.stripe_reader_key).to eq('tmr_fixture')
    expect { register(lane: 'alias-lane') }.to raise_error(Payments::Conflict, /original lane/)
    expect(PaymentTerminal.count).to eq(1)
    expect(TerminalAdministration.count).to eq(1)
  end
  it 'keeps an unknown registration exclusive across alias lanes and recovers only the original key' do
    calls = 0
    allow(readers).to receive(:retrieve).with('tmr_fixture') { calls += 1; raise IOError, 'lost lookup' if calls == 1; reader }
    key = SecureRandom.uuid
    expect(register(key).state).to eq('unknown')
    expect { register(lane: 'alias-lane') }.to raise_error(Payments::Conflict, /administration is unresolved/)
    expect(calls).to eq(1)
    expect(register(key).state).to eq('succeeded')
    expect(PaymentTerminal.count).to eq(1)
  end
  it 'enforces one physical reader per identity in the database even under a different lane' do
    allow(readers).to receive(:retrieve).and_return(reader)
    register
    expect do
      PaymentTerminal.transaction(requires_new: true) do
        PaymentTerminal.create!(payment_identity: identity, payment_profile: profile, location: location,
          lane_id: 'alias-lane', terminal_id: 'tmr_fixture', label: 'Alias')
      end
    end.to raise_error(ActiveRecord::RecordNotUnique)
  end
  it 'retires the local reader while preserving its Stripe registration and historical row' do
    allow(readers).to receive(:retrieve).with('tmr_fixture').and_return(reader)
    terminal = register.payment_terminal
    operation = Payments::ManageTerminal.call(user: user, profile: profile, terminal: terminal, location: location,
      lane_id: terminal.lane_id, terminal_reference: terminal.terminal_id, label: terminal.label, operation_key: SecureRandom.uuid, kind: 'retire')
    expect(operation.state).to eq('succeeded')
    expect(terminal.reload).to have_attributes(enabled: false, status: 'retired')
    expect(PaymentTerminal.count).to eq(1)
  end
end
