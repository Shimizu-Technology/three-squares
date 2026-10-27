require "rails_helper"

RSpec.describe "Public storefront eligibility", type: :request do
  it "hides disabled products and collections from listings and direct URLs, including mixed collections" do
    cookies = create(:collection, slug: "cookies", published: true)
    main = create(:collection, slug: "mains", published: true)
    cookie = create(:product)
    meal = create(:product)
    cookie.collections << [cookies, main]
    meal.collections << main
    SiteSetting.instance.update!(enable_storefront_latte_stone: false)

    get "/api/v1/products"
    expect(response.parsed_body.fetch("products").map { |row| row.fetch("id") }).to eq([meal.id])
    get "/api/v1/products/#{cookie.slug}"
    expect(response).to have_http_status(:not_found)
    get "/api/v1/collections/#{cookies.slug}"
    expect(response).to have_http_status(:not_found)
    get "/api/v1/collections/#{main.slug}"
    expect(response.parsed_body.fetch("products").map { |row| row.fetch("id") }).to eq([meal.id])
    expect(response.parsed_body.fetch("collection").fetch("product_count")).to eq(1)
  end
end
