require 'rails_helper'

RSpec.describe 'Dashboard simulation disclosure', type: :request do
  let(:owner) { create(:user, :owner) }
  let(:location) { create(:location) }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow_any_instance_of(Api::V1::Admin::DashboardController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::DashboardController).to receive(:current_user).and_return(owner)
    identity = PaymentIdentity.create!(provider: 'stripe', environment: 'production', external_account_id: 'notice-fixture', credential_reference: 'fixture', profile_key: SecureRandom.uuid)
    order = create(:order, total_cents: 1000, payment_status: 'paid', payment_environment: 'production', payment_identity_id: identity.id, location: location)
    LegacyCaptureBinding.create!(order: order, payment_identity: identity, provider: 'stripe', environment: 'production', external_account_id: identity.external_account_id,
      consumption_reference: 'notice-capture', original_reference: 'notice-capture', amount_cents: 1000, currency: 'USD', verified_at: Time.current)
    Refund.create!(order: order, amount_cents: 250, status: 'succeeded')
    2.times { create(:order, total_cents: 9900, payment_status: 'paid', simulated: true, payment_environment: 'simulated', location: location) }
    create(:order, total_cents: 9900, payment_status: 'paid', simulated: true, payment_environment: 'simulated', location: create(:location))
    create(:order, total_cents: 9900, payment_status: 'paid', payment_environment: 'sandbox', location: location)
  end

  [ [ 'production', 'production', 'false', nil ], [ 'sandbox', 'staging', 'false', nil ], [ 'simulated', 'development', 'true', 3 ] ].each do |mode, deployment, simulation, count|
    it "keeps production net revenue unchanged and discloses excluded orders only in #{mode} mode" do
      allow(ENV).to receive(:[]).with('APP_DEPLOYMENT_ENV').and_return(deployment)
      allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return(simulation)
      get '/api/v1/admin/dashboard/stats'
      expect(response).to have_http_status(:ok)
      stats = response.parsed_body
      expect(stats.fetch('total_revenue_cents')).to eq(750)
      expect(stats.fetch('total_orders')).to eq(1)
      expect(stats.keys).to match_array(%w[total_orders total_revenue_cents pending_orders total_products business_line_breakdown fulfillment_breakdown location_breakdown] + (count ? ['excluded_simulated_order_count'] : []))
      expect(stats['excluded_simulated_order_count']).to eq(count)
      get '/api/v1/admin/dashboard/chart_data'
      expect(response).to have_http_status(:ok)
      chart = response.parsed_body
      expect(chart.fetch('series').sum { |row| row.fetch('revenue_cents') }).to eq(750)
      expect(chart.fetch('series').sum { |row| row.fetch('orders') }).to eq(1)
      expect(chart.keys).to match_array(%w[series comparison] + (count ? ['excluded_simulated_order_count'] : []))
      expect(chart['excluded_simulated_order_count']).to eq(count)
    end
  end

  it 'restricts the all-time excluded count to the staff location and omits it in production even if the flag is mis-set' do
    allow(ENV).to receive(:[]).with('APP_DEPLOYMENT_ENV').and_return('development')
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    manager = create(:user, :manager, assigned_location: location)
    allow_any_instance_of(Api::V1::Admin::DashboardController).to receive(:current_user).and_return(manager)
    get '/api/v1/admin/dashboard/stats'
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch('excluded_simulated_order_count')).to eq(2)
    allow(ENV).to receive(:[]).with('APP_DEPLOYMENT_ENV').and_return('production')
    get '/api/v1/admin/dashboard/stats'
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).not_to have_key('excluded_simulated_order_count')
  end
end
