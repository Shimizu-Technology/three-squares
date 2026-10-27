require "rails_helper"

RSpec.describe "Admin devices", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let!(:location) { create(:location, name: "Tamuning") }
  let!(:other_location) { create(:location, name: "Other") }
  let(:headers) { { "X-Admin-Device-Id" => "device-under-test" } }
  let(:subscription_attributes) do
    sub = build(:admin_push_subscription)
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } }
  end

  before do
    allow_any_instance_of(Api::V1::Admin::DevicesController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::DevicesController).to receive(:current_user).and_return(admin_user)
    allow(WebPushConfig).to receive(:configured?).and_return(true)
  end

  def register(location_id = location.id)
    put "/api/v1/admin/devices/current", params: { device: { name: "Kitchen iPad", location_id: location_id } }, headers: headers
  end

  it "registers, reads, updates active state, and disables the current subscription" do
    register
    expect(response).to have_http_status(:ok)
    device = AdminDevice.find_by!(device_uuid: "device-under-test")
    expect(device.location).to eq(location)
    get "/api/v1/admin/devices/current", headers: headers
    expect(response.parsed_body.dig("device", "name")).to eq("Kitchen iPad")
    post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(device.admin_push_subscriptions.active.count).to eq(1)
    delete "/api/v1/admin/devices/current/push_subscription", headers: headers
    expect(device.admin_push_subscriptions.active).to be_empty
    patch "/api/v1/admin/devices/#{device.id}", params: { device: { active: false } }
    expect(response).to have_http_status(:ok)
    expect(device.reload).not_to be_active
    expect(device.location).to eq(location)
  end

  it "rejects customers" do
    admin_user.update!(role: "customer")
    register
    expect(response).to have_http_status(:forbidden)
    expect(AdminDevice.count).to eq(0)
  end

  it "requires a bounded device identity" do
    get "/api/v1/admin/devices/current"
    expect(response).to have_http_status(:unprocessable_entity)
    get "/api/v1/admin/devices/current", headers: { "X-Admin-Device-Id" => "x" * 129 }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "validates global location IDs instead of coercing them or raising foreign-key errors" do
    register("unknown")
    expect(response).to have_http_status(:unprocessable_entity)
    register(999999)
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "allows global admins to leave devices unassigned but not to subscribe them" do
    register(nil)
    expect(response).to have_http_status(:ok)
    post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "requires registration and complete valid subscriptions" do
    post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
    register
    [ { endpoint: "https://localhost/push", keys: subscription_attributes[:keys] },
      { endpoint: subscription_attributes[:endpoint], keys: { p256dh: "invalid", auth: "invalid" } },
      { endpoint: subscription_attributes[:endpoint] } ].each do |attrs|
      post "/api/v1/admin/devices/current/push_subscription", params: { subscription: attrs }, headers: headers
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(AdminPushSubscription.count).to eq(0)
  end

  it "does not steal or deactivate a different device's endpoint on duplicate registration" do
    existing = create(:admin_push_subscription, endpoint: subscription_attributes[:endpoint])
    register
    post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
    expect(existing.reload).to be_active
    expect(existing.admin_device_id).not_to eq(AdminDevice.find_by!(device_uuid: "device-under-test").id)
  end

  it "deactivates old subscriptions when global assignment changes" do
    register
    device = AdminDevice.find_by!(device_uuid: "device-under-test")
    sub = create(:admin_push_subscription, admin_device: device)
    patch "/api/v1/admin/devices/#{device.id}", params: { device: { location_id: other_location.id } }
    expect(response).to have_http_status(:ok)
    expect(sub.reload).not_to be_active
  end

  context "with a location-scoped admin" do
    before { admin_user.update!(assigned_location: location) }

    it "forces their location on registration and current-device updates with blank or foreign assignments" do
      [nil, other_location.id, ""].each do |submitted_location|
        register(submitted_location)
        expect(response).to have_http_status(:ok)
        expect(AdminDevice.find_by!(device_uuid: "device-under-test").location).to eq(location)
        expect(response.parsed_body.dig("device", "location_locked")).to be(true)
      end
    end

    it "forces their location on managed updates and preserves false active values" do
      device = create(:admin_device, user: admin_user, location: location)
      patch "/api/v1/admin/devices/#{device.id}", params: { device: { location_id: nil, active: false } }
      expect(response).to have_http_status(:ok)
      expect(device.reload.location).to eq(location)
      expect(device).not_to be_active
    end

    it "repairs an owned blank/foreign registration when subscribing" do
      device = create(:admin_device, user: admin_user, location: nil, device_uuid: "device-under-test")
      post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(device.reload.location).to eq(location)
    end

    it "hides and rejects foreign devices even when the caller supplies their UUID" do
      device = create(:admin_device, location: other_location, device_uuid: "device-under-test")
      patch "/api/v1/admin/devices/#{device.id}", params: { device: { location_id: location.id } }
      expect(response).to have_http_status(:not_found)
      register
      expect(response).to have_http_status(:not_found)
      post "/api/v1/admin/devices/current/push_subscription", params: { subscription: subscription_attributes }, headers: headers
      expect(response).to have_http_status(:not_found)
      get "/api/v1/admin/devices"
      expect(response.parsed_body["devices"]).to be_empty
      expect(device.reload.location).to eq(other_location)
    end
  end
end
