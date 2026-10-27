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

  it "requires positive shipping weight, fills missing option weights and preserves explicit box weights" do
    product = create(:product, allow_pickup: true, allow_shipping: false, weight_oz: nil)
    ProductLocation.create!(product: product, location: main, available: true)
    custom = create(:product_variant, product: product, weight_oz: 16)
    weightless = create(:product_variant, product: product, weight_oz: nil)
    [ nil, 0, -1 ].each do |weight|
      patch "/api/v1/admin/products/#{product.id}", params: { product: { allow_shipping: true, weight_oz: weight } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(product.reload.allow_shipping).to be(false)
    end
    patch "/api/v1/admin/products/#{product.id}", params: { product: { allow_shipping: true, weight_oz: 8 } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(product.reload.product_variants.find_by!(is_default: true).weight_oz).to eq(8)
    expect(custom.reload.weight_oz).to eq(16)
    expect(weightless.reload.weight_oz).to eq(8)
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
  [ nil, 0 ].each do |legacy_weight|
    it "preserves cash commit and restoration for legacy shipping stock with product weight #{legacy_weight.inspect}" do
      main.update!(hours_json: { "Daily" => "00:00-23:59" })
      SiteSetting.instance.update!(enable_storefront_three_squares: true)
      product = create(:product, published: true, inventory_level: "product", product_stock_quantity: 6, allow_shipping: false, weight_oz: nil)
      product.update_columns(allow_shipping: true, weight_oz: legacy_weight)
      variant = product.product_variants.first!
      variant.update!(weight_oz: 8)
      ProductLocation.create!(product: product, location: main, available: true)
      allow_any_instance_of(Api::V1::Admin::PosOrdersController).to receive(:current_user).and_return(owner)
      post "/api/v1/admin/pos/orders", params: { order: { payment_method: "cash", cash_received_cents: 100_000, location_id: main.id,
        items: [ { product_variant_id: variant.id, quantity: 2 } ] } }, headers: { "Idempotency-Key" => SecureRandom.uuid }, as: :json
      expect(response).to have_http_status(:created), response.body
      order = Order.find(response.parsed_body.fetch("id"))
      expect(order.payment_status).to eq("paid")
      expect(product.reload.product_stock_quantity).to eq(4)
      expect(Payments::RestoreInventory.call(order: order)).to include(restored: true)
      expect(product.reload.product_stock_quantity).to eq(6)
      expect(product.weight_oz).to eq(legacy_weight)
      expect(Payments::RestoreInventory.call(order: order)).to include(restored: false)
      expect(product.reload.product_stock_quantity).to eq(6)
    end
  end
end
