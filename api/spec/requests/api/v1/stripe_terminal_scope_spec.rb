require 'rails_helper'

RSpec.describe 'Stripe Terminal account/location boundary', type: :request do
  let(:owner) { create(:user, :admin) }
  let(:location) { create(:location) }
  let(:identity) { PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_fixture', profile_key: SecureRandom.uuid, credential_reference: 'stripe_default') }
  let!(:profile) { PaymentProfile.create!(payment_identity: identity, provider: 'stripe', channel: 'pos', presentation: 'stripe_terminal', location: location, enabled: true, capabilities: {'stripe_terminal_location_id' => 'tml_thislocation'}) }
  let(:connection_tokens) { double('connection tokens') }
  let(:readers) { double('readers') }
  before do
    SiteSetting.instance.update!(payment_processor: 'stripe')
    allow_any_instance_of(Api::V1::Admin::StripeTerminalController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::StripeTerminalController).to receive(:current_user).and_return(owner)
    terminal = double('terminal', connection_tokens: connection_tokens, readers: readers)
    provider = double('provider', client: double('client', v1: double('v1', terminal: terminal)))
    allow(Payments::ProviderResolver).to receive(:for_identity).with(identity).and_return(provider)
  end
  it 'restricts both connection tokens and discovery to the configured location' do
    expect(connection_tokens).to receive(:create).with({location: 'tml_thislocation'}).and_return(double(secret: 'fixture-token'))
    post '/api/v1/admin/stripe_terminal/connection_token', headers: {'X-Location-ID' => location.id.to_s}
    expect(response).to have_http_status(:ok)
    expect(readers).to receive(:list).with({limit: 100, location: 'tml_thislocation'}).and_return(double(data: []))
    get '/api/v1/admin/stripe_terminal/readers', headers: {'X-Location-ID' => location.id.to_s}
    expect(response.parsed_body).to include('stripe_location_id' => 'tml_thislocation', 'readers' => [])
  end
  it 'never issues an account-wide token for a missing or unassigned location' do
    expect(connection_tokens).not_to receive(:create)
    post '/api/v1/admin/stripe_terminal/connection_token'
    expect(response).to have_http_status(:service_unavailable)
    profile.update!(capabilities: {})
    post '/api/v1/admin/stripe_terminal/connection_token', headers: {'X-Location-ID' => location.id.to_s}
    expect(response).to have_http_status(:service_unavailable)
  end
end
