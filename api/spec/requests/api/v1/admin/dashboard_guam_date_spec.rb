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
    ['sandbox', 'simulated', nil].each do |environment|
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
end
