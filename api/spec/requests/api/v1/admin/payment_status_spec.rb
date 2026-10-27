require 'rails_helper'

RSpec.describe 'Read-only payment status', type: :request do
  let(:owner) { create(:user, :owner) }
  let(:location) { create(:location) }
  let(:url) { '/api/v1/admin/site_settings/payment_status' }
  before do
    SiteSetting.instance.update!(payment_processor: 'worldpay')
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:fetch).and_call_original
    env('APP_DEPLOYMENT_ENV', 'development'); env('PAYMENTS_SIMULATION_ENABLED', 'true')
    env('WORLDPAY_TRANSPORT_ENABLED', 'false'); env('WORLDPAY_TRIPOS_TRANSPORT_ENABLED', 'false')
    Payments::Worldpay::Configuration::CREDENTIAL_ENV.values.each { |key| env(key, nil) }
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider traffic forbidden' }
    acting(owner)
  end
  def env(key, value) = allow(ENV).to receive(:[]).with(key).and_return(value)
  def acting(user)
    [Api::V1::Admin::SiteSettingsController, Api::V1::Admin::SettingsController].each do |controller|
      allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
      allow_any_instance_of(controller).to receive(:current_user).and_return(user)
    end
  end
  def profile(environment, location: nil, provider: 'worldpay', presentation: 'worldpay_hosted_fields', capabilities: {})
    identity = PaymentIdentity.create!(provider: provider, environment: environment, external_account_id: "fixture-#{SecureRandom.hex(4)}",
      external_acceptor_id: provider == 'worldpay' && environment != 'simulated' ? 'fixture-acceptor' : nil,
      credential_reference: environment == 'simulated' ? 'simulation' : "#{provider}_default", profile_key: SecureRandom.uuid)
    PaymentProfile.create!(payment_identity: identity, provider: provider, channel: 'online', location: location, presentation: presentation, capabilities: capabilities, enabled: true)
  end
  def row(location = nil, channel = 'online')
    response.parsed_body.fetch('profiles').find { |value| value['location_id'] == location&.id && value['channel'] == channel }
  end
  def production
    env('APP_DEPLOYMENT_ENV', 'production'); env('PAYMENTS_SIMULATION_ENABLED', 'false'); env('WORLDPAY_MODE', 'production')
    allow(ENV).to receive(:fetch).with('APP_MODE', 'test').and_return('production')
  end
  it 'uses the selected provider and exact local override over the default without authorizing simulated dispatch' do
    default = profile('simulated')
    local = profile('sandbox', location: location, presentation: 'worldpay_hosted_page', capabilities: { 'hosted_page_variant' => 'legacy' })
    profile('simulated', location: location, provider: 'stripe', presentation: 'stripe_embedded')
    get url
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.fetch('selected_provider')).to eq('worldpay')
    expect(row).to include('identity_id' => default.payment_identity_id, 'environment' => 'simulated', 'real_dispatch_enabled' => false)
    expect(row(location)).to include('identity_id' => local.payment_identity_id, 'environment' => 'sandbox', 'network_gate_enabled' => false, 'real_dispatch_enabled' => false)
    expect(row(location).fetch('blockers')).to include('Waiting on Worldpay credentials and application configuration.')
    expect(row(location, 'pos').fetch('blockers').join).to include('No enabled payment profile')
  end
  it 'blocks a production identity outside production independently of the legacy test flag' do
    production
    saved = profile('production', location: location)
    env('APP_DEPLOYMENT_ENV', 'development')
    get url
    expect(response).to have_http_status(:ok)
    expect(row(location)).to include('identity_id' => saved.payment_identity_id, 'environment' => 'production', 'real_dispatch_enabled' => false)
    expect(row(location).fetch('blockers').join).to include('Deployment payment safeguards')
  end
  it 'reports production database guard failures without changing settings or granting dispatch' do
    production
    profile('production', location: location)
    original = SiteSetting.instance.attributes
    get url
    expect(response).to have_http_status(:ok)
    expect(row(location)['real_dispatch_enabled']).to be(false)
    expect(row(location).fetch('blockers').join).to include('Deployment payment safeguards')
    expect(SiteSetting.instance.reload.attributes).to eq(original)
  end
  it 'checks the actual Stripe secret slot locally and never exposes keys or arbitrary capabilities' do
    SiteSetting.instance.update!(payment_processor: 'stripe')
    profile('sandbox', location: location, provider: 'stripe', presentation: 'stripe_embedded', capabilities: { 'unexpected_secret' => 'private-fixture-value' })
    env('STRIPE_SECRET_KEY_TEST', 'sk_live_wrong_fixture')
    get url
    expect(row(location)['real_dispatch_enabled']).to be(false)
    env('STRIPE_SECRET_KEY_TEST', 'rk_test_private_fixture')
    get url
    expect(row(location)['real_dispatch_enabled']).to be(true)
    expect(response.body).not_to include('rk_test_private_fixture', 'sk_live_wrong_fixture', 'private-fixture-value', 'unexpected_secret')
  end
  it 'isolates malformed online and POS profiles while keeping healthy rows available' do
    healthy = profile('simulated')
    bad_online = profile('sandbox', location: location, presentation: 'worldpay_hosted_page',
      capabilities: { 'hosted_page_variant' => 'legacy', 'terminal_profile' => 'private-malformed-value' })
    bad_pos = PaymentProfile.create!(payment_identity: bad_online.payment_identity, provider: 'worldpay', channel: 'pos',
      location: location, presentation: 'worldpay_terminal', capabilities: { 'contract_approved' => true, 'contract_version' => '5.0.4',
        'usd_query_contract' => true, 'query_completeness_approved' => true, 'reporting_time_zone' => ['private-invalid-zone'] }, enabled: true)
    allow(Rails.logger).to receive(:warn)
    get url
    expect(response).to have_http_status(:ok), response.body
    expect(row).to include('profile_id' => healthy.id, 'environment' => 'simulated', 'blockers' => [])
    [row(location), row(location, 'pos')].zip([bad_online, bad_pos]).each do |result, saved|
      expect(result).to include('profile_id' => saved.id, 'real_dispatch_enabled' => false)
      expect(result.fetch('blockers')).to include("This profile's configuration could not be checked. An operator must review it.")
    end
    expect(Rails.logger).to have_received(:warn).with('Payments::Configuration::UnsafeConfiguration')
    expect(Rails.logger).to have_received(:warn).with('ArgumentError')
    expect(response.body).not_to include('private-malformed-value', 'private-invalid-zone')
  end

  it 'uses resolver selection and the runtime preflight instead of a parallel readiness predicate' do
    saved = profile('sandbox', location: location, presentation: 'worldpay_hosted_page', capabilities: { 'hosted_page_variant' => 'legacy' })
    allow(Payments::ProviderResolver).to receive(:selected_provider).and_return('worldpay')
    allow(Payments::Worldpay::Runtime).to receive(:preflight_profile!).and_raise(Payments::Configuration::UnsafeConfiguration, 'private-contract-detail')
    get url
    expect(response).to have_http_status(:ok)
    expect(Payments::ProviderResolver).to have_received(:selected_provider)
    expect(Payments::Worldpay::Runtime).to have_received(:preflight_profile!).with(identity: saved.payment_identity,
      profile: Payments::Worldpay::ProfileSnapshot.capture(saved))
    expect(row(location)['real_dispatch_enabled']).to be(false)
    expect(response.body).not_to include('private-contract-detail')
  end

  it 'keeps the legacy server flag read-only and preserves unrelated owner changes' do
    SiteSetting.instance.update!(payment_test_mode: true)
    put '/api/v1/admin/site_settings', params: { site_setting: { payment_test_mode: false, store_name: 'Owner draft' } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include('payment_test_mode' => true, 'store_name' => 'Owner draft')
    put '/api/v1/admin/settings', params: { settings: { payment_test_mode: false, send_retail_emails: false } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(SiteSetting.instance.reload.payment_test_mode).to be(true)
  end
  it 'denies both manager scopes the existing owner-only settings surface' do
    [create(:user, :manager), create(:user, :manager, assigned_location: location)].each do |manager|
      acting(manager); get url
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body).not_to have_key('profiles')
      get '/api/v1/admin/site_settings'
      expect(response).to have_http_status(:forbidden)
    end
  end
end
