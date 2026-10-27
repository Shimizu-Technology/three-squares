require "rails_helper"
require Rails.root.join("spec/support/payment_foundation_helpers")

RSpec.describe "Catalog price contract", type: :request do
  include PaymentFoundationHelpers
  let(:location) { create(:location, hours_json: { "Daily" => "00:00-23:59" }) }
  let(:product) { create(:product, product_type: "local", base_price_cents: 1250, sale_price_cents: 900, allow_pickup: true, allow_shipping: false) }
  let(:variant) { product.product_variants.first }
  let(:headers) { { "X-Session-ID" => "catalog-price-spec", "X-Location-ID" => location.id.to_s } }
  before { ProductLocation.create!(product: product, location: location, available: true, price_override_cents: 1050) }

  it "agrees on listing/detail/collection/cart/checkout and durable order snapshot" do
    collection = create(:collection, slug: "mains", published: true)
    product.collections << collection
    get "/api/v1/products", params: { location_id: location.id, sort: "price_asc", min_price: "10.50", max_price: "10.50" }
    expect(response).to have_http_status(:ok)
    listing = response.parsed_body.fetch("products").first.fetch("pricing")
    expect(listing).to include("unit_price_cents" => 1050, "compare_at_price_cents" => nil)
    get "/api/v1/products/#{product.slug}", params: { location_id: location.id }
    expect(response.parsed_body.fetch("pricing")).to eq(listing)
    expect(response.parsed_body.fetch("variants").first.fetch("pricing")).to eq(listing)
    get "/api/v1/collections/#{collection.slug}", params: { location_id: location.id }
    expect(response.parsed_body.fetch("products").first.fetch("pricing")).to eq(listing)
    post "/api/v1/cart/items", params: { product_variant_id: variant.id, quantity: 2 }, headers: headers
    expect(response).to have_http_status(:created), response.body
    get "/api/v1/cart", headers: headers
    expect(response.parsed_body.fetch("subtotal_cents")).to eq(2100)
    expect(response.parsed_body.fetch("items").first.fetch("product_variant").fetch("price_cents")).to eq(1050)
    configure_payment_fixture!
    session = Payments::CreateCheckout.call(user: nil, capability: @capability, idempotency_key: @request_key,
      cart_items: CartItem.for_session("catalog-price-spec").to_a,
      attributes: { fulfillment_type: "pickup", location_id: location.id, customer_name: "Price Fixture", customer_email: "price@example.test", customer_phone: "6715550100" })
    expect(session.amount_cents).to eq(2100)
    expect(session.order.order_items.first.unit_price_cents).to eq(1050)
    expect(session.snapshot.fetch("items").first.fetch("unit_price_cents")).to eq(1050)
  end

  it "sorts and filters effective prices and leaves quote items last" do
    other = create(:product, product_type: "local", base_price_cents: 800)
    quote = create(:product, product_type: "market_price", base_price_cents: 0)
    get "/api/v1/products", params: { sort: "price_asc" }
    expect(response.parsed_body.fetch("products").map { |row| row.fetch("id") }).to eq([other.id, product.id, quote.id])
    get "/api/v1/products", params: { sort: "price_desc", max_price: "9.00" }
    expect(response.parsed_body.fetch("products").map { |row| row.fetch("id") }).to eq([product.id, other.id])
  end

  it "blocks quote items at cart and checkout, including stale cart rows" do
    product.update!(product_type: "quote_only")
    post "/api/v1/cart/items", params: { product_variant_id: variant.id, quantity: 1 }, headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
    expect(CartItem.count).to eq(0)
    item = CartItem.create!(product_variant: variant, quantity: 1, session_id: "catalog-price-spec")
    get "/api/v1/cart", headers: headers
    expect(response.parsed_body.fetch("items").first.fetch("pricing").fetch("purchasable")).to be(false)
    expect { CheckoutPricingService.resolve!(cart_items: [item], fulfillment_type: "pickup", location_id: location.id) }.to raise_error(CheckoutPricingService::PricingError)
    expect { Payments::Eligibility.validate_product!(variant: variant, location_id: location.id) }.to raise_error(Payments::FulfillmentError, /price before ordering/)
  end
  it "uses the same location cents in the POS menu and cash order" do
    admin = create(:user, role: "admin")
    [Api::V1::Admin::PosMenuController, Api::V1::Admin::PosOrdersController].each do |controller|
      allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
      allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    end
    get "/api/v1/admin/pos/menu", params: { location_id: location.id }
    expect(response).to have_http_status(:ok)
    row = response.parsed_body.fetch("categories").flat_map { |category| category.fetch("items") }.find { |item| item.fetch("id") == product.id }
    expect(row.fetch("variants").first.fetch("price_cents")).to eq(1050)
    post "/api/v1/admin/pos/orders", params: { order: { payment_method: "cash", location_id: location.id, cash_received_cents: 2100,
      items: [{ product_variant_id: variant.id, quantity: 2 }] } }, headers: { "Idempotency-Key" => SecureRandom.uuid }
    expect(response).to have_http_status(:created), response.body
    order = Order.order(:id).last
    expect(order.total_cents).to eq(2100)
    expect(order.order_items.first.unit_price_cents).to eq(1050)
  end

  it "keeps payable POS sizes when a sibling has an unresolved zero price" do
    product.update!(sale_price_cents: nil)
    variant.update!(price_cents: 0)
    paid = create(:product_variant, product: product, price_cents: 1800, variant_key: "paid-size")
    admin = create(:user, role: "admin")
    controller = Api::V1::Admin::PosMenuController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    get "/api/v1/admin/pos/menu", params: { location_id: location.id }
    row = response.parsed_body.fetch("categories").flat_map { |category| category.fetch("items") }.find { |item| item.fetch("id") == product.id }
    expect(row.fetch("variants").map { |size| size.fetch("id") }).to eq([paid.id])
    expect(row.fetch("variants").first.fetch("price_cents")).to eq(1800)
  end

  it "returns the location validation explanation through the admin save path and rolls back the edit" do
    create(:product_variant, product: product, price_cents: 1800, variant_key: "large")
    admin = create(:user, role: "admin")
    controller = Api::V1::Admin::ProductsController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    original_name = product.name
    patch "/api/v1/admin/products/#{product.id}", params: { product: { name: "Rejected edit", location_ids: [location.id] } }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch("errors").join).to include("single #{location.name} price can't be set. Edit each size's price instead.")
    expect(product.reload.name).to eq(original_name)
  end

  it "reprices the same cart for explicit pickup destinations and ignores pickup overrides for shipping" do
    second = create(:location, hours_json: { "Daily" => "00:00-23:59" })
    ProductLocation.create!(product: product, location: second, available: true, price_override_cents: 1500)
    CartItem.create!(product_variant: variant, quantity: 1, session_id: "catalog-price-spec")
    get "/api/v1/cart", params: { fulfillment_type: "pickup", location_id: location.id }, headers: headers
    expect(response.parsed_body.fetch("subtotal_cents")).to eq(1050)
    expect(response.parsed_body.fetch("pricing_context")).to eq("fulfillment_type" => "pickup", "location_id" => location.id)
    get "/api/v1/cart", params: { fulfillment_type: "pickup", location_id: second.id }, headers: headers
    expect(response.parsed_body.fetch("subtotal_cents")).to eq(1500)
    expect(response.parsed_body.fetch("pricing_context")).to eq("fulfillment_type" => "pickup", "location_id" => second.id)
    expect(CheckoutPricingService.resolve!(cart_items: CartItem.for_session("catalog-price-spec").to_a,
      fulfillment_type: "pickup", location_id: second.id).subtotal_cents).to eq(1500)
    get "/api/v1/cart", params: { fulfillment_type: "shipping", location_id: second.id }, headers: headers
    expect(response.parsed_body.fetch("subtotal_cents")).to eq(900)
    expect(response.parsed_body.fetch("pricing_context")).to eq("fulfillment_type" => "shipping", "location_id" => nil)
  end

end
