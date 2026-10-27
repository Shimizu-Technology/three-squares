require "rails_helper"

RSpec.describe "Admin devices", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let!(:location) { create(:location, name: "Tamuning") }

  before do
    allow_any_instance_of(Api::V1::Admin::DevicesController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::DevicesController).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(Api::V1::Admin::DevicesController).to receive(:current_user).and_return(admin_user)
  end

  it "registers the current device and returns it" do
    put "/api/v1/admin/devices/current",
        params: {
          device: {
            name: "Kitchen iPad",
            location_id: location.id,
            platform: "iPad",
            browser: "Safari",
            user_agent: "TestAgent/1.0"
          }
        },
        headers: {
          "X-Admin-Device-Id" => "device-under-test"
        }

    expect(response).to have_http_status(:ok)
    expect(AdminDevice.find_by(device_uuid: "device-under-test")&.location).to eq(location)

    get "/api/v1/admin/devices/current", headers: { "X-Admin-Device-Id" => "device-under-test" }

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json.dig("device", "name")).to eq("Kitchen iPad")
    expect(json.dig("device", "location_name")).to eq("Tamuning")
  end
end
