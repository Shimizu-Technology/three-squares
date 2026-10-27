require "rails_helper"

RSpec.describe "Public checkout isolation from staff authorization", type: :request do
  let!(:location) { create(:location, hours_json: { "Daily" => "00:00-23:59" }) }
  let!(:product) { create(:product, product_type: "local", allow_pickup: true, allow_shipping: false,
    inventory_level: "product", product_stock_quantity: 10) }
  let!(:variant) { create(:product_variant, product: product, price_cents: 2500) }
  let!(:identity) { PaymentIdentity.create!(provider: "worldpay", environment: "simulated",
    external_account_id: "public-rbac", profile_key: SecureRandom.uuid, credential_reference: "simulation") }
  let(:customer) { create(:user) }

  around do |example|
    previous = ENV["PAYMENTS_SIMULATION_ENABLED"]
    ENV["PAYMENTS_SIMULATION_ENABLED"] = "true"
    example.run
  ensure
    previous.nil? ? ENV.delete("PAYMENTS_SIMULATION_ENABLED") : ENV["PAYMENTS_SIMULATION_ENABLED"] = previous
  end

  before do
    SiteSetting.instance.update!(payment_processor: "worldpay", enable_storefront_three_squares: true)
    PaymentProfile.create!(payment_identity: identity, provider: "worldpay", channel: "online", presentation: "worldpay_hosted_fields", enabled: true)
    ProductLocation.create!(product: product, location: location)
    users = double("Clerk users")
    client = double("Clerk client", users: users)
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token).and_return({ "sub" => customer.clerk_id })
    allow(users).to receive(:find).with(customer.clerk_id).and_return(
      "primary_email_address_id" => "email", "email_addresses" => [ { "id" => "email", "email_address" => customer.email } ])
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise "External HTTP forbidden in checkout isolation specs" }
  end

  def start_checkout(authenticated:)
    cart_key = SecureRandom.hex(24)
    @headers = { "X-Checkout-Capability" => SecureRandom.hex(32), "X-Session-ID" => cart_key, "Idempotency-Key" => SecureRandom.uuid }
    @headers["Authorization"] = "Bearer customer-token" if authenticated
    CartItem.create!(session_id: cart_key, product_variant: variant, quantity: 1)
    post "/api/v1/checkout_sessions", params: { order: { customer_name: "Authorization fixture",
      email: "fixture@example.test", phone: "6715550100", fulfillment_type: "pickup", location_id: location.id } }, headers: @headers, as: :json
    expect(response).to have_http_status(:created), response.body
    response.parsed_body
  end

  it "inventories every public checkout action so new actions require an isolation request" do
    actions = Rails.application.routes.routes.filter_map do |route|
      route.defaults[:action] if route.defaults[:controller] == "api/v1/checkout_sessions"
    end.uniq
    expect(actions).to match_array(%w[create show confirm cancel simulate advance_simulation])
  end

  [ false, true ].each do |authenticated|
    it "keeps every #{authenticated ? 'customer' : 'guest'} checkout action public while enforcing session capability and opaque handles" do
      # Spy on the real constructor, never replace the policy with a permissive
      # fake. An accidental central staff guard fails even if a response is 200.
      expect(StaffAccessPolicy).not_to receive(:new)
      state = start_checkout(authenticated: authenticated)
      base = "/api/v1/checkout_sessions/#{state.fetch('id')}"
      session = CheckoutSession.find(state.fetch("id"))
      expect(session.user_id).to eq(authenticated ? customer.id : nil)

      get base, headers: @headers
      expect(response).to have_http_status(:ok)
      post "#{base}/confirm", headers: @headers
      expect(response).to have_http_status(:accepted)
      post "#{base}/advance_simulation", params: { seconds: 1 }, headers: @headers, as: :json
      expect(response).to have_http_status(:ok)

      # Removing identity AND forging the guest capability never borrows a
      # customer's session; an opaque handle alone is insufficient for guests.
      unauthorized = @headers.except("Authorization").merge("X-Checkout-Capability" => SecureRandom.hex(32))
      %w[simulate advance_simulation].each do |action|
        post "#{base}/#{action}", params: { scenario: "approve", handle: state.dig("collection_config", "client_secret"), seconds: 1 }, headers: unauthorized, as: :json
        expect(response).to have_http_status(:not_found)
      end
      post "#{base}/simulate", params: { scenario: "approve", handle: "sim_guessed" }, headers: @headers, as: :json
      expect(response).to have_http_status(:not_found)
      expect(session.order.reload.payment_status).to eq("pending")
      expect(product.reload.product_stock_quantity).to eq(10)

      post "#{base}/simulate", params: { scenario: "approve", handle: state.dig("collection_config", "client_secret") }, headers: @headers, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(session.order.reload.payment_status).to eq("paid")
      expect(product.reload.product_stock_quantity).to eq(9)

      second = start_checkout(authenticated: authenticated)
      post "/api/v1/checkout_sessions/#{second.fetch('id')}/cancel", headers: @headers
      expect(response).to have_http_status(:accepted), response.body
      expect(CheckoutSession.find(second.fetch("id")).order.reload.payment_status).not_to eq("paid")
    end
  end

  it "retains the disabled-simulator guard for both customer simulation actions without consulting staff policy" do
    expect(StaffAccessPolicy).not_to receive(:new)
    state = start_checkout(authenticated: true)
    ENV["PAYMENTS_SIMULATION_ENABLED"] = "false"
    %w[simulate advance_simulation].each do |action|
      post "/api/v1/checkout_sessions/#{state.fetch('id')}/#{action}", params: { seconds: 1,
        scenario: "approve", handle: state.dig("collection_config", "client_secret") }, headers: @headers, as: :json
      expect(response).to have_http_status(:service_unavailable)
    end
    expect(CheckoutSession.find(state.fetch("id")).order.payment_status).to eq("pending")
    expect(product.reload.product_stock_quantity).to eq(10)
  end

  it "rejects both simulation actions under production deployment guards without consulting staff policy" do
    expect(StaffAccessPolicy).not_to receive(:new)
    state = start_checkout(authenticated: true)
    previous = ENV["APP_DEPLOYMENT_ENV"]
    ENV["APP_DEPLOYMENT_ENV"] = "production"
    %w[simulate advance_simulation].each do |action|
      post "/api/v1/checkout_sessions/#{state.fetch('id')}/#{action}", params: { seconds: 1,
        scenario: "approve", handle: state.dig("collection_config", "client_secret") }, headers: @headers, as: :json
      expect(response).to have_http_status(:service_unavailable)
    end
    expect(CheckoutSession.find(state.fetch("id")).order.payment_status).to eq("pending")
    expect(product.reload.product_stock_quantity).to eq(10)
  ensure
    previous.nil? ? ENV.delete("APP_DEPLOYMENT_ENV") : ENV["APP_DEPLOYMENT_ENV"] = previous
  end
end
