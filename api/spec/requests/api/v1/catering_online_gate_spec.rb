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

  it "batches collection classification queries as the public collection page grows" do
    add_product = lambda do
      meal = create(:product, product_type: "local", published: true, inventory_level: "variant", allow_pickup: true, allow_shipping: false)
      create(:product_variant, product: meal, stock_quantity: 6, price_cents: 1200)
      meal.collections << collection
    end
    2.times { add_product.call }
    measure = lambda do |expected_count|
      queries = []
      callback = lambda do |_name, _start, _finish, _id, payload|
        queries << payload[:sql] if payload[:name] == "Collection Load" && !payload[:cached]
      end
      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
        get "/api/v1/collections/#{collection.slug}", params: { per_page: 50 }
      end
      expect(response).to have_http_status(:ok), response.body
      rows = response.parsed_body.fetch("products")
      expect(rows.size).to eq(expected_count)
      expect(rows).to all(include("pricing" => include("purchasable" => false, "reason" => StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)))
      queries.size
    end
    initial = measure.call(3)
    4.times { add_product.call }
    expect(measure.call(7)).to eq(initial)
  end

  it "preloads classification for every public online-price serializer path" do
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    calls = 0
    allow(CatalogPrice).to receive(:resolve).and_wrap_original do |original, **arguments|
      if arguments[:online]
        calls += 1
        expect(arguments.fetch(:product).association(:collections)).to be_loaded
      end
      original.call(**arguments)
    end
    [ "/api/v1/products", "/api/v1/products/#{product.slug}", "/api/v1/collections/#{collection.slug}", "/api/v1/cart" ].each do |path|
      previous_calls = calls
      get path, headers: { "X-Session-ID" => cart_id }
      expect(response).to have_http_status(:ok), response.body
      expect(calls).to be > previous_calls
    end
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
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }, as: :json
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
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }, as: :json
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
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }, as: :json
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

  def create_undispatched_checkout
    configure_payment_fixture!
    SiteSetting.instance.update!(enable_catering_online_ordering: true)
    item = CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 1)
    Payments::CreateCheckout.call(user: nil, capability: @capability, idempotency_key: @request_key,
      cart_items: [ item ], attributes: attributes)
  end

  it "withholds saved-order credentials and closes a gated undispatched retry without provider work" do
    session = create_undispatched_checkout
    attempt = session.payment_attempts.last
    SiteSetting.instance.update!(enable_catering_online_ordering: false)
    expect(Payments::ProviderResolver).not_to receive(:for_attempt)
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("collection_config")).to eq("available" => false, "reason" => StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    post "/api/v1/checkout_sessions", headers: payment_headers(cart_id), params: { order: attributes }, as: :json
    expect(response).to have_http_status(:created), response.body
    expect(response.parsed_body.fetch("payment_state")).to eq("cancelled")
    expect(attempt.reload).to have_attributes(state: "cancelled", error_classification: "catering_inquiry_required", next_recovery_at: nil, dispatched_at: nil, raw_provider_id: nil)
    expect(session.reload.state).to eq("cancelled")
    expect(session.order.reload.status).to eq("cancelled")
    expect(InventoryReservation.where(order_id: session.order_id, state: "held")).to be_empty
    expect(variant.reload.stock_quantity).to eq(6)
    post "/api/v1/checkout_sessions/#{session.id}/cancel", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:accepted), response.body
    expect(response.parsed_body.fetch("payment_state")).to eq("cancelled")
  end

  it "records the system closure for staff without standard cancellation email or SMS" do
    session = create_undispatched_checkout
    order = session.order
    order.update!(metadata: order.metadata.merge("fixture_note" => "preserved"), admin_notes: "Staff draft")
    SiteSetting.instance.update!(enable_catering_online_ordering: false, enable_order_emails: true, enable_order_sms: true)
    expect(order).not_to be_simulated
    expect(order.payment_environment).to eq("sandbox")
    expect(order.customer_email).to be_present
    expect(order.customer_phone).to be_present
    expect {
      Payments::SetupAttempt.call(attempt: session.payment_attempts.last)
    }.not_to change { PaymentOutbox.where(kind: "notification").count }
    expect(order.reload).to have_attributes(status: "cancelled", admin_notes: "Staff draft")
    expect(order.metadata).to include("fixture_note" => "preserved", "system_cancellation" => { "actor" => "system", "reason" => "catering_inquiry_required" })
    headers = sign_in(create(:user, :owner))
    get "/api/v1/admin/orders/#{order.id}", headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.fetch("order").fetch("system_cancellation")).to eq("actor" => "system", "reason" => "catering_inquiry_required")
  end

  it "keeps standard customer email and SMS for ordinary cancellations" do
    session = create_undispatched_checkout
    order = session.order
    SiteSetting.instance.update!(enable_order_emails: true, enable_order_sms: true)
    expect {
      Payments::UpdateOrder.call(order: order, attributes: { status: "cancelled" }, user: nil)
    }.to change { PaymentOutbox.where(kind: "notification").count }.by(2)
    notifications = PaymentOutbox.where(kind: "notification").map(&:payload)
    expect(notifications.map { |payload| payload.fetch("job") }).to contain_exactly("SendOrderStatusEmailJob", "SendOrderSmsJob")
    expect(notifications).to all(include("args" => [ order.id, "cancelled", order.reload.notification_seq ]))
    expect(order.metadata).not_to have_key("system_cancellation")
  end

  it "lets recovery close a never-dispatched gated intent once and never retries it" do
    session = create_undispatched_checkout
    attempt = session.payment_attempts.last
    attempt.update!(next_recovery_at: 1.minute.ago)
    SiteSetting.instance.update!(enable_catering_online_ordering: false)
    expect(Payments::ProviderResolver).not_to receive(:for_attempt)
    PaymentRecoveryJob.perform_now
    expect(attempt.reload.state).to eq("cancelled")
    retries = attempt.retry_count
    attempt.update_columns(updated_at: 1.day.ago)
    PaymentRecoveryJob.perform_now
    expect(attempt.reload.retry_count).to eq(retries)
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("collection_config").fetch("available")).to be(false)
    post "/api/v1/checkout_sessions/#{session.id}/confirm", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:accepted), response.body
    expect(attempt.reload.state).to eq("cancelled")
  end

  it "closes an unknown preflight failure proven never dispatched before transport is restored" do
    session = create_undispatched_checkout
    attempt = session.payment_attempts.last
    provider = PaymentFoundationHelpers::Provider.new(session.payment_identity)
    provider.define_singleton_method(:preflight) { |attempt:| raise Payments::Configuration::UnsafeConfiguration, "Fixture transport disabled" }
    allow(Payments::ProviderResolver).to receive(:for_attempt).and_return(provider)
    expect { Payments::SetupAttempt.call(attempt: attempt) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect(attempt.reload).to have_attributes(state: "unknown", dispatched_at: nil, raw_provider_id: nil, setup_id: nil)
    SiteSetting.instance.update!(enable_catering_online_ordering: false)
    attempt.update!(next_recovery_at: 1.minute.ago)
    expect(Payments::ProviderResolver).not_to receive(:for_attempt)
    PaymentRecoveryJob.perform_now
    expect(attempt.reload).to have_attributes(state: "cancelled", error_classification: "catering_inquiry_required", next_recovery_at: nil)
    expect(InventoryReservation.where(order_id: session.order_id, state: "held")).to be_empty
    retries = attempt.retry_count
    attempt.update_columns(updated_at: 1.day.ago)
    PaymentRecoveryJob.perform_now
    expect(attempt.reload.retry_count).to eq(retries)
  end

  it "does not locally close a previously dispatched or ambiguous attempt" do
    session = create_undispatched_checkout
    attempt = session.payment_attempts.last
    Payments::SetupAttempt.call(attempt: attempt)
    before = attempt.reload.attributes
    SiteSetting.instance.update!(enable_catering_online_ordering: false)
    Payments::SetupAttempt.call(attempt: attempt)
    expect(attempt.reload.attributes).to eq(before)
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response.parsed_body.fetch("collection_config")).to eq("available" => false, "reason" => StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE)
    attempt.update!(state: "unknown", last_queried_at: nil)
    post "/api/v1/checkout_sessions/#{session.id}/confirm", headers: payment_headers(cart_id)
    expect(attempt.reload.captured_cents).to eq(1200)
    expect(attempt.state).not_to eq("cancelled")
    expect(PaymentOutbox.where(kind: "compensate")).to exist
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
