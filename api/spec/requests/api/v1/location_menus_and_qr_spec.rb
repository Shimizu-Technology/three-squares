require "rails_helper"

RSpec.describe "Location menu URLs and QR codes", type: :request do
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("PUBLIC_STOREFRONT_ORIGIN").and_return(nil)
    allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return(nil)
  end
  it "resolves active public locations by slug, without exposing notification routing" do
    location = create(:location, slug: "main", admin_email: "private@example.com")
    get "/api/v1/locations/main"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("id")).to eq(location.id)
    expect(response.parsed_body.fetch("hours_json").keys.sort).to eq(Date::DAYNAMES.sort)
    expect(response.parsed_body).not_to have_key("admin_email")
    location.update!(active: false)
    get "/api/v1/locations/main"
    expect(response).to have_http_status(:not_found)
    get "/api/v1/locations/missing"
    expect(response).to have_http_status(:not_found)
  end

  it "generates and saves the canonical menu link only for authenticated admins" do
    location = create(:location, slug: "main")
    post "/api/v1/admin/locations/#{location.id}/generate_qr"
    expect(response).to have_http_status(:unauthorized)
    allow_any_instance_of(Api::V1::Admin::LocationsController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::LocationsController).to receive(:current_user).and_return(create(:user, :admin))
    post "/api/v1/admin/locations/#{location.id}/generate_qr"
    expect(response).to have_http_status(:ok)
    body = response.parsed_body.fetch("data")
    expect(body.fetch("menu_url")).to eq("https://three-squares-web.netlify.app/menu/main")
    expect(body.fetch("svg")).to include("<svg", "viewBox")
    expect(location.reload.qr_code_url).to eq(body.fetch("menu_url"))
    post "/api/v1/admin/locations/#{location.id}/generate_qr", params: { base_url: "https://evil.example" }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(location.reload.qr_code_url).to eq(body.fetch("menu_url"))
  end
end

RSpec.describe QrCodeService do
  let(:location) { build(:location, slug: "donki") }
  around do |example|
    saved = ENV.to_h.slice("PUBLIC_STOREFRONT_ORIGIN", "FRONTEND_URL")
    ENV.delete("PUBLIC_STOREFRONT_ORIGIN")
    ENV.delete("FRONTEND_URL")
    example.run
  ensure
    %w[PUBLIC_STOREFRONT_ORIGIN FRONTEND_URL].each { |key| ENV.delete(key) }
    saved.each { |key, value| ENV[key] = value }
  end

  it "accepts only the configured exact origin and encodes the direct location path" do
    expect(described_class.new(location, base_url: "https://three-squares-web.netlify.app/").menu_url)
      .to eq("https://three-squares-web.netlify.app/menu/donki")
    %w[http://three-squares-web.netlify.app https://three-squares-web.netlify.app:444 https://three-squares-web.netlify.app.evil.test https://user@three-squares-web.netlify.app https://three-squares-web.netlify.app/path https://three-squares-web.netlify.app?x=1 https://three-squares-web.netlify.app#fragment javascript:alert(1)].each do |origin|
      expect { described_class.new(location, base_url: origin) }.to raise_error(ArgumentError)
    end
  end

  it "rejects malformed and private production origins and invalid slugs" do
    allow(Rails.env).to receive(:production?).and_return(true)
    %w[http://localhost:5173 https://127.0.0.1 https://192.168.1.1 https://thing.local https://thing.LOCAL https://thing.internal https://thing.test https://bad..host https://app.example.com/path].each do |origin|
      ENV["PUBLIC_STOREFRONT_ORIGIN"] = origin
      expect { described_class.new(location) }.to raise_error(ArgumentError)
    end
    ENV.delete("PUBLIC_STOREFRONT_ORIGIN")
    location.slug = "invalid/slug"
    expect { described_class.new(location) }.to raise_error(ArgumentError)
  end
end
