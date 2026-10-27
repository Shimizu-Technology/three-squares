require "rails_helper"

RSpec.describe "Public pickup schedule", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  it "expands legacy Daily hours for editing and publishes current Guam availability" do
    location = Location.create!(name: "Donki", slug: "donki")
    location.update_columns(hours_json: { "Daily" => "10am - 10pm" })
    travel_to(Time.utc(2026, 10, 27, 13)) do
      get "/api/v1/locations"
      row = response.parsed_body.fetch("locations").find { |entry| entry.fetch("id") == location.id }
      expect(row.fetch("hours_json").keys.sort).to eq(Date::DAYNAMES.sort)
      expect(row.fetch("accepting_orders_now")).to be(false)
    end
  end
end

RSpec.describe "Public menu type choices", type: :request do
  it "lists eligible types independently of selected type and pagination" do
    meal = create(:product, product_type: "Plate")
    create(:product, product_type: "Drink")
    cookies = create(:collection, slug: "cookies", published: true)
    create(:product, product_type: "Cookie").collections << cookies
    SiteSetting.instance.update!(enable_storefront_latte_stone: false)

    get "/api/v1/products", params: { per_page: 1, product_type: "Plate" }
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("products").pluck("id")).to eq([meal.id])
    expect(response.parsed_body.fetch("meta").fetch("product_types")).to eq(%w[Drink Plate])
  end
end
