require "rails_helper"

RSpec.describe "Restaurant product shipping weight", type: :request do
  let(:owner) { create(:user, :owner) }
  let!(:main) { create(:location) }
  let!(:donki) { create(:location) }

  before do
    allow_any_instance_of(Api::V1::Admin::ProductsController).to receive(:current_user).and_return(owner)
    allow_any_instance_of(Api::V1::Admin::ProductVariantsController).to receive(:current_user).and_return(owner)
  end

  it "creates a pickup meal with a usable default variant and no fabricated weight" do
    post "/api/v1/admin/products", params: { product: { name: "Kitchen pickup lunch", product_type: "local",
      base_price_cents: 1200, inventory_level: "none", allow_pickup: true, allow_shipping: false,
      weight_oz: 0, location_ids: [ main.id, donki.id ] } }, as: :json
    expect(response).to have_http_status(:created)
    product = Product.find(response.parsed_body.fetch("data").fetch("id"))
    expect(product.weight_oz).to be_nil
    expect(product.product_variants.count).to eq(1)
    expect(product.product_variants.first).to have_attributes(weight_oz: nil, price_cents: 1200, available: true)
    patch "/api/v1/admin/products/#{product.id}", params: { product: { weight_oz: 0, location_ids: [ main.id ] } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(product.reload.product_locations.available.pluck(:location_id)).to eq([ main.id ])
  end

  it "requires positive shipping weight and copies it only to the default option" do
    product = create(:product, allow_pickup: true, allow_shipping: false, weight_oz: nil)
    ProductLocation.create!(product: product, location: main, available: true)
    custom = create(:product_variant, product: product, weight_oz: 16)
    [ nil, 0, -1 ].each do |weight|
      patch "/api/v1/admin/products/#{product.id}", params: { product: { allow_shipping: true, weight_oz: weight } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(product.reload.allow_shipping).to be(false)
    end
    patch "/api/v1/admin/products/#{product.id}", params: { product: { allow_shipping: true, weight_oz: 8 } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(product.reload.product_variants.find_by!(is_default: true).weight_oz).to eq(8)
    expect(custom.reload.weight_oz).to eq(16)
  end

  it "allows weightless pickup options while retaining shipping option validation" do
    pickup = create(:product, inventory_level: "variant", allow_shipping: false, weight_oz: nil)
    post "/api/v1/admin/products/#{pickup.id}/variants", params: { variant: { variant_key: "meal-box", price_cents: 1200, stock_quantity: 0, weight_oz: 0 } }, as: :json
    expect(response).to have_http_status(:created)
    expect(pickup.product_variants.last.weight_oz).to be_nil
    shipping = create(:product, inventory_level: "variant", allow_shipping: true, weight_oz: 8)
    post "/api/v1/admin/products/#{shipping.id}/variants", params: { variant: { variant_key: "cookie-box", price_cents: 1200, stock_quantity: 0 } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
  end
end
