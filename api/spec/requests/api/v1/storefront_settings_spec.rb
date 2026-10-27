require "rails_helper"

RSpec.describe "Storefront settings", type: :request do
  let(:admin) { create(:user, :admin) }
  let(:controller) { Api::V1::Admin::SiteSettingsController }

  it "enables the existing storefronts by default" do
    get "/api/v1/config"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include(
      "enable_storefront_three_squares" => true,
      "enable_storefront_latte_stone" => true,
      "enable_storefront_catering" => true
    )
  end

  it "persists independent admin toggles and exposes them in public config" do
    SiteSetting.instance
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)

    patch "/api/v1/admin/site_settings", params: {
      site_setting: {
        enable_storefront_three_squares: false,
        enable_storefront_latte_stone: true,
        enable_storefront_catering: false
      }
    }
    expect(response).to have_http_status(:ok)
    expect(SiteSetting.instance.reload.enable_storefront_catering).to be(false)

    get "/api/v1/config"
    expect(response.parsed_body).to include(
      "enable_storefront_three_squares" => false,
      "enable_storefront_latte_stone" => true,
      "enable_storefront_catering" => false
    )
  end

  it "rejects customer settings changes" do
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(create(:user))
    patch "/api/v1/admin/site_settings", params: { site_setting: { enable_storefront_catering: false } }
    expect(response).to have_http_status(:forbidden)
  end
end
