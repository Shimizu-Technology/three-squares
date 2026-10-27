require "rails_helper"

RSpec.describe "Admin order device scope", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let!(:north_location) { create(:location, name: "North") }
  let!(:south_location) { create(:location, name: "South") }
  let!(:north_order) { create(:order, :guest, location: north_location, payment_status: "paid", total_cents: 2000) }
  let!(:south_order) { create(:order, :guest, location: south_location, payment_status: "paid", total_cents: 3500) }
  let!(:device) { create(:admin_device, user: admin_user, location: north_location, device_uuid: "device-scope-1") }

  before do
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:current_user).and_return(admin_user)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:current_admin_device).and_return(device)
  end

  it "defaults list and summary queries to the device location" do
    get "/api/v1/admin/orders"

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json["orders"].map { |order| order["id"] }).to contain_exactly(north_order.id)

    get "/api/v1/admin/orders/summary"

    expect(response).to have_http_status(:ok)
    summary = JSON.parse(response.body)
    expect(summary["total_orders"]).to eq(1)
    expect(summary["total_revenue_cents"]).to eq(2000)
  end

  it "allows explicit location filters to override the device default" do
    get "/api/v1/admin/orders", params: { location_id: south_location.id }

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json["orders"].map { |order| order["id"] }).to contain_exactly(south_order.id)
  end
end
