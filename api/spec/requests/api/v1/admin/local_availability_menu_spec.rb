require "rails_helper"

RSpec.describe "Staff local availability recovery menu", type: :request do
  let!(:main) { create(:location) }
  let!(:donki) { create(:location) }
  let(:actor) { create(:user, :staff, assigned_location: main) }
  let!(:meal) { create(:product, product_type: "local", published: true, allow_pickup: true, allow_shipping: false, weight_oz: nil) }

  before do
    allow_any_instance_of(Api::V1::Admin::PosMenuController).to receive(:current_user).and_return(actor)
    allow_any_instance_of(Api::V1::Admin::ProductsController).to receive(:current_user).and_return(actor)
  end

  def menu(include_unavailable: false)
    get "/api/v1/admin/pos/menu", params: { location_id: main.id, include_unavailable: include_unavailable.to_s }
    expect(response).to have_http_status(:ok)
    response.parsed_body.fetch("categories").flat_map { |category| category.fetch("items") }
  end

  it "retains local sold-out meals for restore without making them saleable or changing another location" do
    local = ProductLocation.create!(product: meal, location: main, available: false)
    remote = ProductLocation.create!(product: meal, location: donki, available: true)
    expect(menu.map { |product| product.fetch("id") }).not_to include(meal.id)
    shown = menu(include_unavailable: true).find { |product| product.fetch("id") == meal.id }
    expect(shown).to include("location_available" => false)
    expect(shown.fetch("variants")).to all(include("in_stock" => false))
    patch "/api/v1/admin/products/#{meal.id}/availability", params: { availability: { location_id: main.id, available: true } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(local.reload.available).to be(true)
    expect(remote.reload.available).to be(true)
    expect(meal.reload.published).to be(true)
    expect(menu(include_unavailable: true).find { |product| product.fetch("id") == meal.id }).to include("location_available" => true)
  end

  it "keeps the operation usable despite unrelated legacy price data, preserving the price" do
    row = ProductLocation.create!(product: meal, location: main, available: true, price_override_cents: 1200)
    create(:product_variant, product: meal, price_cents: 1700)
    expect(row.reload).not_to be_valid
    patch "/api/v1/admin/products/#{meal.id}/availability", params: { availability: { location_id: main.id, available: false } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(row.reload).to have_attributes(available: false, price_override_cents: 1200)
  end

  it "does not offer archived or shipping-only products in a counter restore menu" do
    archived = create(:product, published: true, archived: true)
    shipping = create(:product, published: true, allow_pickup: false, allow_shipping: true, weight_oz: 8)
    expect(menu(include_unavailable: true).map { |product| product.fetch("id") }).not_to include(archived.id, shipping.id)
  end
end
