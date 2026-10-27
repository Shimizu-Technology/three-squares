require "rails_helper"

RSpec.describe "Dashboard Guam dates", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  it "counts midnight Guam sales on the local date and includes today in the chart" do
    admin = create(:user, :admin)
    controller = Api::V1::Admin::DashboardController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    order = create(:order, created_at: Time.utc(2026, 10, 26, 14, 30), total_cents: 1800, payment_environment: "production")
    order.update_columns(payment_status: "paid")
    identity = PaymentIdentity.create!(provider: 'stripe', environment: 'production', external_account_id: 'chart-fixture', credential_reference: 'fixture', profile_key: SecureRandom.uuid)
    order.update!(payment_identity_id: identity.id)
    LegacyCaptureBinding.create!(order: order, payment_identity: identity, provider: 'stripe', environment: 'production', external_account_id: identity.external_account_id,
      consumption_reference: 'chart-charge', original_reference: 'chart-charge', amount_cents: 1800, currency: 'USD', verified_at: Time.current)
    [ 'sandbox', 'simulated', nil ].each do |environment|
      excluded = create(:order, created_at: order.created_at, total_cents: 9900,
        payment_environment: environment, simulated: environment == 'simulated')
      excluded.update_columns(payment_status: 'paid')
    end
    travel_to(Time.utc(2026, 10, 27, 2)) do
      get "/api/v1/admin/dashboard/chart_data", params: { days: 7 }
      expect(response).to have_http_status(:ok)
      series = response.parsed_body.fetch("series")
      expect(series.last).to include("date" => "2026-10-27", "orders" => 1, "revenue_cents" => 1800)
      expect(series.find { |row| row.fetch("date") == "2026-10-26" }.fetch("orders")).to eq(0)
    end
  end

  it 'uses net capture revenue for all breakdowns and the Guam week across the UTC Sunday boundary' do
    admin = create(:user, :owner)
    controller = Api::V1::Admin::DashboardController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    location = create(:location)
    identity = PaymentIdentity.create!(provider: 'stripe', environment: 'production', external_account_id: 'net-chart', credential_reference: 'fixture', profile_key: SecureRandom.uuid)
    orders = [ 2000, 1000, 3000 ].each_with_index.map do |amount, index|
      order = create(:order, created_at: Time.utc(2026, 10, 25, 14, 30), total_cents: amount, payment_environment: 'production',
        payment_identity_id: identity.id, payment_status: 'paid', location: location, order_type: index == 2 ? 'wholesale' : 'retail')
      LegacyCaptureBinding.create!(order: order, payment_identity: identity, provider: 'stripe', environment: 'production', external_account_id: identity.external_account_id,
        consumption_reference: "net-#{order.id}", original_reference: "net-#{order.id}", amount_cents: amount, currency: 'USD', verified_at: Time.current)
      order
    end
    cookie = create(:product)
    collection = Collection.find_or_create_by!(slug: 'cookies') { |c| c.name = 'Cookies' }
    create(:product_collection, product: cookie, collection: collection)
    variant = create(:product_variant, product: cookie)
    create(:order_item, order: orders[1], product: cookie, product_variant: variant)
    Refund.create!(order: orders[0], amount_cents: 500, status: 'succeeded')
    Refund.create!(order: orders[1], amount_cents: 1000, status: 'succeeded')
    orders[1].update!(payment_status: 'refunded')
    Refund.create!(order: orders[2], amount_cents: 3000, status: 'pending')
    travel_to(Time.utc(2026, 10, 25, 15)) do
      get '/api/v1/admin/dashboard/stats'
      expect(response).to have_http_status(:ok)
      json = response.parsed_body
      expect(json.fetch('total_revenue_cents')).to eq(4500)
      expect(json.dig('business_line_breakdown', 'three_squares', 'revenue_cents')).to eq(1500)
      expect(json.dig('business_line_breakdown', 'latte_stone', 'revenue_cents')).to eq(0)
      expect(json.dig('business_line_breakdown', 'catering', 'revenue_cents')).to eq(3000)
      expect(json.fetch('location_breakdown').find { |l| l['name'] == location.name }.fetch('revenue_cents')).to eq(4500)
      get '/api/v1/admin/dashboard/chart_data', params: { days: 7 }
      expect(response.parsed_body.fetch('series').last).to include('date' => '2026-10-26', 'revenue_cents' => 4500)
      expect(response.parsed_body.dig('comparison', 'this_week', 'revenue_cents')).to eq(4500)
      expect(response.parsed_body.dig('comparison', 'last_week', 'revenue_cents')).to eq(0)
    end
  end
end
