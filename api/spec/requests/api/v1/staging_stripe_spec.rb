require "rails_helper"
require_relative "../../../support/refund_fixtures"

RSpec.describe "Staging Stripe integration", type: :request do
  include RefundFixtures
  let(:secret) { "whsec_staging_fixture" }
  let(:fixture) { captured_order }

  before do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
    allow(ENV).to receive(:[]).and_call_original
    { "APP_DEPLOYMENT_ENV" => "staging", "STRIPE_SECRET_KEY_TEST" => "rk_test_fixture",
      "STRIPE_PUBLISHABLE_KEY_TEST" => "pk_test_fixture", "STRIPE_WEBHOOK_SECRET" => secret,
      "STRIPE_WEBHOOK_ACCOUNT_ID" => "acct_refund_fixture" }.each do |name, value|
      allow(ENV).to receive(:[]).with(name).and_return(value)
    end
  end

  it "returns the sandbox publishable key and account through the public config endpoint" do
    SiteSetting.instance
    identity = fixture[1]
    PaymentProfile.create!(provider: "stripe", payment_identity: identity, channel: "online", presentation: "stripe_embedded", enabled: true)
    get "/api/v1/config"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("stripe_publishable_key" => "pk_test_fixture", "stripe_account_id" => identity.external_account_id,
      "payment_environment" => "sandbox", "app_mode" => "test", "simulation_enabled" => false)
    expect(Payments::StripeProvider.new(identity).request_options).to eq(api_key: "rk_test_fixture", stripe_account: identity.external_account_id)
  end

  it "serves stored sandbox collection keys through checkout and POS responses" do
    owner = create(:user, :admin)
    location = create(:location)
    identity = fixture[1]
    order = create(:order, location: location, source: "pos", staff_created: true, created_by_user_id: owner.id,
      payment_identity_id: identity.id, payment_environment: "sandbox", payment_provider: "stripe", payment_status: "pending")
    session = CheckoutSession.create!(order: order, user: owner, location: location, payment_identity: identity, owner_key: "user:#{owner.id}", channel: "pos",
      guest_capability_digest: "", caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot", amount_cents: order.total_cents, expires_at: 1.hour.from_now)
    attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: order.total_cents,
      payload_digest: "snapshot", state: "collecting", collection_config: { "flow" => "stripe_embedded", "client_secret" => "fixture_client_secret" })
    order.update!(checkout_session_id: session.id, payment_attempt_id: attempt.id)
    [Api::V1::CheckoutSessionsController, Api::V1::Admin::PosOrdersController].each do |controller|
      allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
      allow_any_instance_of(controller).to receive(:current_user).and_return(owner)
    end
    get "/api/v1/checkout_sessions/#{session.id}"
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.fetch("collection_config")).to include("stripe_publishable_key" => "pk_test_fixture", "payment_environment" => "sandbox")
    allow(Payments::ReconcileAttempt).to receive(:call)
    post "/api/v1/admin/pos/orders/#{order.id}/confirm_terminal_payment"
    expect(response).to have_http_status(:accepted), response.body
    expect(response.parsed_body.fetch("collection_config")).to include("stripe_publishable_key" => "pk_test_fixture", "payment_environment" => "sandbox")
  end

  def deliver(operation, livemode: false, signing_secret: secret, account: nil)
    body = { id: "evt_staging_#{livemode}_#{account}", object: "event", type: "refund.updated", livemode: livemode,
      data: { object: { id: "re_staging", object: "refund", status: "succeeded", currency: "usd", amount: operation.amount_cents,
        payment_intent: operation.original_reference, metadata: { refund_operation_id: operation.id, operation_key: operation.operation_key } } } }
    body[:account] = account if account
    payload = body.to_json
    timestamp = Time.now.to_i
    signature = OpenSSL::HMAC.hexdigest("SHA256", signing_secret, "#{timestamp}.#{payload}")
    post "/webhooks/stripe", params: payload, headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => "t=#{timestamp},v1=#{signature}" }
  end

  it "verifies the configured secret and fallback account and converges signed test-money refunds" do
    operation = Payments::ReserveRefund.call(order: fixture[0], amount_cents: 500, request_key: "staging-refund")
    deliver(operation, signing_secret: "wrong-secret")
    expect(response).to have_http_status(:bad_request)
    expect(PaymentEvent.count).to eq(0)
    deliver(operation)
    expect(response).to have_http_status(:ok), response.body
    expect(operation.reload.state).to eq("succeeded")
    expect(PaymentEvent.last).to have_attributes(environment: "sandbox", external_account_id: fixture[1].external_account_id, payment_identity_id: fixture[1].id)
  end

  it "refuses live-mode and foreign-account events without completing the refund" do
    operation = Payments::ReserveRefund.call(order: fixture[0], amount_cents: 500, request_key: "staging-refusal")
    deliver(operation, livemode: true)
    expect(response).to have_http_status(:unprocessable_entity)
    deliver(operation, account: "acct_foreign")
    expect(response).to have_http_status(:unprocessable_entity)
    expect(operation.reload.state).to eq("reserved")
  end

  it "keeps production QR origin rules for hosted staging" do
    allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return("http://localhost:5173")
    expect { QrCodeService.new(build(:location, slug: "main")) }.to raise_error(ArgumentError, /public HTTPS/)
  end
end
