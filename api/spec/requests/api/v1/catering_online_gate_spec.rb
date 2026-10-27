require "rails_helper"
require Rails.root.join("spec/support/payment_foundation_helpers")

RSpec.describe "Catering online ordering gate", type: :request do
  include PaymentFoundationHelpers
  let(:location) { create(:location, hours_json: { "Daily" => "00:00-23:59" }) }
  let(:product) { create(:product, product_type: "local", published: true, inventory_level: "variant", allow_pickup: true, allow_shipping: false) }
  let!(:variant) { create(:product_variant, product: product, stock_quantity: 6, price_cents: 1200) }
  let(:collection) { create(:collection, slug: "catering-platters", published: true) }
  let(:cart_id) { SecureRandom.hex(24) }
  let(:attributes) { { customer_name: "Gate fixture", customer_email: "gate@example.test", customer_phone: "6715550100", fulfillment_type: "pickup", location_id: location.id } }
  before do
    product.collections << collection
    ProductLocation.create!(product: product, location: location, available: true)
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise "External HTTP forbidden" }
  end

  def sign_in(actor)
    client = double("Clerk client")
    users = double("Clerk users")
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token).with("gate-owner-test").and_return({ "sub" => actor.clerk_id })
    allow(client).to receive(:users).and_return(users)
    allow(users).to receive(:find).with(actor.clerk_id).and_return({ "primary_email_address_id" => "email", "email_addresses" => [ { "id" => "email", "email_address" => actor.email } ] })
    { "Authorization" => "Bearer gate-owner-test" }
  end

  it "defaults off, keeps public catalog visible, and marks every public price as inquiry-only" do
    expect(SiteSetting.instance.enable_catering_online_ordering).to be(false)
    get "/api/v1/products", params: { business_line: "catering" }
    expect(response).to have_http_status(:ok)
    row = response.parsed_body.fetch("products").find { |item| item.fetch("id") == product.id }
    expect(row.fetch("pricing")).to include("purchasable" => false, "unit_price_cents" => nil, "reason" => StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    get "/api/v1/products/#{product.slug}"
    expect(response.parsed_body.fetch("pricing").fetch("purchasable")).to be(false)
    expect(response.parsed_body.fetch("variants")).to all(include("pricing" => include("purchasable" => false)))
    get "/api/v1/collections/#{collection.slug}"
    expect(response.parsed_body.fetch("products").first.fetch("pricing").fetch("purchasable")).to be(false)
  end

  it "keeps online SQL price filtering consistent with inquiry-only serialization" do
    expect(Product.where(id: product.id).pick(Arel.sql(CatalogPrice.sql(online: true)))).to be_nil
    SiteSetting.instance.update!(enable_catering_online_ordering: true)
    expect(Product.where(id: product.id).pick(Arel.sql(CatalogPrice.sql(online: true)))).to eq(1200)
    expect(CatalogPrice.resolve(product: product, online: true).purchasable).to be(true)
  end

  it "allows only an owner to read/change the setting, without replacing unrelated settings" do
    headers = sign_in(create(:user, :owner))
    put "/api/v1/admin/site_settings", headers: headers, params: { site_setting: { enable_catering_online_ordering: true } }, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.fetch("enable_catering_online_ordering")).to be(true)
    expect(SiteSetting.instance.enable_storefront_catering).to be(true)
    get "/api/v1/admin/site_settings", headers: headers
    expect(response.parsed_body.fetch("enable_catering_online_ordering")).to be(true)
  end

  %w[manager staff customer].each do |role|
    it "rejects #{role} direct settings writes and reads" do
      headers = sign_in(create(:user, role: role, assigned_location: role == "staff" ? location : nil))
      put "/api/v1/admin/site_settings", headers: headers, params: { site_setting: { enable_catering_online_ordering: true } }, as: :json
      expect(response).to have_http_status(:forbidden)
      expect(SiteSetting.instance.enable_catering_online_ordering).to be(false)
      get "/api/v1/admin/site_settings", headers: headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  it "blocks add-to-cart and stale carts at checkout-session creation before any provider call" do
    configure_payment_fixture!
    expect_any_instance_of(PaymentFoundationHelpers::Provider).not_to receive(:setup)
    post "/api/v1/cart/items", headers: payment_headers(cart_id), params: { product_variant_id: variant.id, quantity: 1 }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch("error")).to include(StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    get "/api/v1/cart", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("items").first.fetch("pricing")).to include("purchasable" => false, "reason" => StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    post "/api/v1/cart/validate", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("issues").first.fetch("message")).to include(StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }
    expect(response).to have_http_status(:unprocessable_entity), response.body
    expect(response.parsed_body.fetch("error")).to include(StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    expect(Order.count).to eq(0)
    expect(PaymentAttempt.count).to eq(0)
    expect(variant.reload.stock_quantity).to eq(6)
  end

  it "permits explicitly enabled checkout and rechecks the setting at finalization" do
    configure_payment_fixture!
    SiteSetting.instance.update!(enable_catering_online_ordering: true)
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }
    expect(response).to have_http_status(:created), response.body
    state = response.parsed_body
    SiteSetting.instance.update!(enable_catering_online_ordering: false)
    post "/api/v1/checkout_sessions/#{state.fetch('id')}/confirm", headers: payment_headers(cart_id)
    order = Order.find(state.fetch("order").fetch("id"))
    expect(order.reload.payment_status).not_to eq("paid")
    expect(order.inventory_committed_at).to be_nil
    expect(variant.reload.stock_quantity).to eq(6)
    expect(PaymentOutbox.where(kind: "compensate")).to exist
  end

  it "allows ordinary online finalization only after the owner enables ordering" do
    configure_payment_fixture!
    SiteSetting.instance.update!(enable_catering_online_ordering: true)
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }
    expect(response).to have_http_status(:created), response.body
    state = response.parsed_body
    post "/api/v1/checkout_sessions/#{state.fetch('id')}/confirm", headers: payment_headers(cart_id)
    expect(Order.find(state.fetch("order").fetch("id")).payment_status).to eq("paid")
    expect(variant.reload.stock_quantity).to eq(5)
  end

  it "keeps manual inquiry submission available while ordering is off without sending messages" do
    allow(EmailService).to receive(:send_catering_inquiry_confirmation).and_return({ success: false, error: "disabled" })
    allow(EmailService).to receive(:send_catering_inquiry_notification).and_return({ success: false, error: "disabled" })
    post "/api/v1/catering", params: { inquiry: { contact_name: "Inquiry fixture", contact_email: "inquiry@example.test", event_type: "corporate", event_date: (Date.current + 10).iso8601, guest_count: 25 } }, as: :json
    expect(response).to have_http_status(:created), response.body
    expect(CateringInquiry.last.status).to eq("pending")
    expect(SiteSetting.instance.enable_catering_online_ordering).to be(false)
  end

  it "keeps POS cash available and never overrides quote-only catalog prices" do
    headers = sign_in(create(:user, :owner)).merge("Idempotency-Key" => SecureRandom.uuid)
    post "/api/v1/admin/pos/orders", headers: headers, params: { order: { payment_method: "cash", location_id: location.id, cash_received_cents: 1200, items: [ { product_variant_id: variant.id, quantity: 1 } ] } }, as: :json
    expect(response).to have_http_status(:created), response.body
    expect(Order.last.payment_status).to eq("paid")
    expect(variant.reload.stock_quantity).to eq(5)
    SiteSetting.instance.update!(enable_catering_online_ordering: true)
    product.update!(product_type: "quote_only")
    expect(CatalogPrice.resolve(product: product, online: true).purchasable).to be(false)
    expect(CatalogPrice.resolve(product: product).purchasable).to be(false)
  end
end
