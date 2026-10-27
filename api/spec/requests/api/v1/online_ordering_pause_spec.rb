require "rails_helper"
require Rails.root.join("spec/support/payment_foundation_helpers")

RSpec.describe "Explicit online ordering pause", type: :request do
  include PaymentFoundationHelpers
  let(:location) { create(:location, hours_json: { "Daily" => "00:00-23:59" }) }
  let(:product) { create(:product, product_type: "local", published: true, inventory_level: "variant", allow_pickup: true, allow_shipping: false) }
  let!(:variant) { create(:product_variant, product: product, stock_quantity: 6, price_cents: 1200) }
  let(:cart_id) { SecureRandom.hex(24) }
  let(:attributes) { { customer_name: "Ordering fixture", customer_email: "ordering@example.test", customer_phone: "6715550100", fulfillment_type: "pickup", location_id: location.id } }
  before do
    ProductLocation.create!(product: product, location: location, available: true)
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise "External HTTP forbidden" }
  end

  def sign_in(actor)
    client = double("Clerk client", users: double("Clerk users"))
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token).with("ordering-owner-test").and_return({ "sub" => actor.clerk_id })
    allow(client.users).to receive(:find).with(actor.clerk_id).and_return({ "primary_email_address_id" => "email", "email_addresses" => [{ "id" => "email", "email_address" => actor.email }] })
    { "Authorization" => "Bearer ordering-owner-test" }
  end

  def build_checkout_fixture(dispatch: true)
    configure_payment_fixture!
    item = CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    session = Payments::CreateCheckout.call(user: nil, capability: @capability, idempotency_key: @request_key, cart_items: [item], attributes: attributes)
    Payments::SetupAttempt.call(attempt: session.payment_attempts.last) if dispatch
    session
  end

  it "defaults open and exposes explicit pause state/message without audit details in public config" do
    get "/api/v1/config"
    expect(response.parsed_body).to include("online_ordering_paused" => false)
    SiteSetting.instance.update!(online_ordering_paused: true, online_ordering_pause_message: "Please check back after lunch.")
    get "/api/v1/config"
    expect(response.parsed_body).to include("online_ordering_paused" => true, "online_ordering_pause_message" => "Please check back after lunch.")
    expect(response.parsed_body).not_to have_key("history")
    get "/api/v1/products/#{product.slug}"
    expect(response).to have_http_status(:ok)
  end

  it "saves owner changes and audits actor, state, message and time atomically without duplicate replays" do
    owner = create(:user, :owner, name: "Fixture Owner")
    headers = sign_in(owner)
    put "/api/v1/admin/online_ordering", headers: headers, params: { online_ordering: { paused: true, customer_message: "  Back soon.  " } }, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body).to include("paused" => true, "customer_message" => "Back soon.")
    audit = OnlineOrderingChange.last
    expect(audit).to have_attributes(actor_id: owner.id, actor_label: "Fixture Owner", paused: true, customer_message: "Back soon.")
    expect(audit.created_at).to be_within(2.seconds).of(Time.current)
    expect(response.parsed_body.fetch("history").first).to include("actor" => "Fixture Owner", "paused" => true, "changed_at" => audit.created_at.iso8601)
    put "/api/v1/admin/online_ordering", headers: headers, params: { online_ordering: { paused: true, customer_message: "Back soon." } }, as: :json
    expect(OnlineOrderingChange.count).to eq(1)
    put "/api/v1/admin/online_ordering", headers: headers, params: { online_ordering: { paused: false, customer_message: "" } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(SiteSetting.instance.online_ordering_paused).to be(false)
    expect(OnlineOrderingChange.order(:id).pluck(:paused)).to eq([true, false])
    get "/api/v1/admin/online_ordering", headers: headers
    expect(response.parsed_body.fetch("history").size).to eq(2)
  end

  %w[manager staff customer].each do |role|
    it "denies #{role} direct pause reads/writes" do
      headers = sign_in(create(:user, role: role, assigned_location: role == "staff" ? location : nil))
      get "/api/v1/admin/online_ordering", headers: headers
      expect(response).to have_http_status(:forbidden)
      put "/api/v1/admin/online_ordering", headers: headers, params: { online_ordering: { paused: true } }, as: :json
      expect(response).to have_http_status(:forbidden)
      expect(SiteSetting.instance.online_ordering_paused).to be(false)
      expect(OnlineOrderingChange.count).to eq(0)
    end
  end

  it "rejects invalid settings without changing state or creating audit rows" do
    headers = sign_in(create(:user, :owner))
    [{ paused: "false" }, { paused: true, customer_message: "x" * 241 }].each do |input|
      put "/api/v1/admin/online_ordering", headers: headers, params: { online_ordering: input }, as: :json
      expect(response).to have_http_status(:unprocessable_entity), response.body
      expect(SiteSetting.instance.online_ordering_paused).to be(false)
      expect(OnlineOrderingChange.count).to eq(0)
    end
  end

  it "refuses cart additions and new checkout/payment setup but retains existing carts and menu" do
    configure_payment_fixture!
    SiteSetting.instance.update!(online_ordering_paused: true, online_ordering_pause_message: "Back soon.")
    expect_any_instance_of(PaymentFoundationHelpers::Provider).not_to receive(:setup)
    post "/api/v1/cart/items", headers: payment_headers(cart_id), params: { product_variant_id: variant.id, quantity: 1 }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch("error")).to eq("Back soon.")
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    %w[checkout_sessions payment_intents].each do |path|
      post "/api/v1/#{path}", headers: payment_headers(cart_id).merge("Idempotency-Key" => SecureRandom.uuid), params: { order: attributes }, as: :json
      expect(response).to have_http_status(:unprocessable_entity), response.body
      expect(response.parsed_body).to include("error" => "Back soon.", "checkout_rejected_before_intent" => true)
    end
    expect(Order.count).to eq(0)
    expect(PaymentAttempt.count).to eq(0)
    get "/api/v1/cart", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("items").size).to eq(1)
  end

  it "refuses a paused legacy product addition before creating a default variant" do
    legacy = create(:product, product_type: "local", published: true)
    legacy.product_variants.destroy_all
    SiteSetting.instance.update!(online_ordering_paused: true, online_ordering_pause_message: "Back soon.")

    expect {
      post "/api/v1/cart/items", headers: { "X-Session-ID" => cart_id }, params: { product_id: legacy.id, quantity: 1 }
    }.not_to change(ProductVariant, :count)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body).to include("error" => "Back soon.")
    expect(legacy.reload.product_variants).to be_empty
    expect(CartItem.count).to eq(0)
  end

  it "allows scoped staff cash POS sales during the public pause" do
    configure_payment_fixture!
    SiteSetting.instance.update!(online_ordering_paused: true)
    headers = sign_in(create(:user, role: "staff", assigned_location: location)).merge("Idempotency-Key" => SecureRandom.uuid)
    post "/api/v1/admin/pos/orders", headers: headers, params: { order: { payment_method: "cash", location_id: location.id, items: [{ product_variant_id: variant.id, quantity: 1 }] } }, as: :json
    expect(response).to have_http_status(:created), response.body
    expect(Order.last).to have_attributes(source: "pos", payment_status: "paid")
  end

  it "continues already dispatched setup replay, recovery and fulfillment while paused" do
    session = build_checkout_fixture
    attempt = session.payment_attempts.last
    original_dispatch = attempt.dispatched_at
    SiteSetting.instance.update!(online_ordering_paused: true)
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("collection_config")["available"]).not_to be(false)
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }, as: :json
    expect(response).to have_http_status(:created), response.body
    expect(PaymentAttempt.count).to eq(1)
    expect(attempt.reload.dispatched_at).to eq(original_dispatch)
    post "/api/v1/checkout_sessions/#{session.id}/confirm", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:ok), response.body
    expect(session.order.reload.payment_status).to eq("paid")
    expect(session.order.inventory_committed_at).to be_present
    expect(variant.reload.stock_quantity).to eq(5)
  end

  it "closes untouched setup after a pause and releases reservations without provider work" do
    session = build_checkout_fixture(dispatch: false)
    attempt = session.payment_attempts.last
    SiteSetting.instance.update!(online_ordering_paused: true)
    expect(Payments::ProviderResolver).not_to receive(:for_attempt)
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(attempt.reload).to have_attributes(state: "cancelled", error_classification: "online_ordering_paused", dispatched_at: nil)
    expect(session.order.reload.status).to eq("cancelled")
    expect(InventoryReservation.where(order_id: session.order_id, state: "held")).to be_empty
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("collection_config")).to include("available" => false, "reason" => OnlineOrderingAvailability::DEFAULT_MESSAGE)
  end

  it "rechecks pause under the first-dispatch lock after preflight" do
    session = build_checkout_fixture(dispatch: false)
    provider = PaymentFoundationHelpers::Provider.new(@payment_identity)
    allow(Payments::ProviderResolver).to receive(:for_attempt).and_return(provider)
    provider.define_singleton_method(:preflight) { |attempt:| SiteSetting.instance.update!(online_ordering_paused: true) }
    expect(provider).not_to receive(:setup)
    expect { Payments::SetupAttempt.call(attempt: session.payment_attempts.last) }.to raise_error(Payments::FulfillmentError, OnlineOrderingAvailability::DEFAULT_MESSAGE)
    expect(session.payment_attempts.last.dispatched_at).to be_nil
  end
end
