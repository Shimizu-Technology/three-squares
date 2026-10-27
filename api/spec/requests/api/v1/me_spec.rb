require "rails_helper"

RSpec.describe "Current user profile", type: :request do
  it "requires authentication" do
    get "/api/v1/me"
    expect(response).to have_http_status(:unauthorized)
  end

  it "returns the authenticated customer contact details for checkout" do
    user = create(:user, name: "Checkout Customer", phone: "671-555-0142")
    allow_any_instance_of(Api::V1::MeController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::MeController).to receive(:current_user).and_return(user)

    get "/api/v1/me"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include(
      "id" => user.id, "email" => user.email,
      "name" => "Checkout Customer", "phone" => "671-555-0142", "role" => "customer"
    )
  end
end
