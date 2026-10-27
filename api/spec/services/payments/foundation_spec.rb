require "rails_helper"
require "open3"

RSpec.describe "Payment foundation" do
  let(:identity) { PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_fixture", profile_key: SecureRandom.uuid, credential_reference: "stripe_default") }
  let(:order) { create(:order) }
  let(:session) { CheckoutSession.create!(order: order, payment_identity: identity, owner_key: SecureRandom.hex(32), guest_capability_digest: CheckoutSession.digest("a" * 64), caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot", amount_cents: 1500, expires_at: 1.hour.from_now) }
  let(:attempt) { PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot") }

  it "requires a high entropy capability rather than a cart session header" do
    expect(session.authorized?(user: nil, capability: "cart-session")).to be false
    expect(session.authorized?(user: nil, capability: "a" * 64)).to be true
    session.update!(expires_at: 1.second.ago)
    expect(session.authorized?(user: nil, capability: "a" * 64)).to be false
  end

  it "binds account sessions to their authenticated owner" do
    user = create(:user)
    session = CheckoutSession.create!(order: order, user: user, payment_identity: identity, owner_key: user.id.to_s, guest_capability_digest: "", caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot", amount_cents: 1500, expires_at: 1.hour.from_now)
    expect(session.authorized?(user: nil, capability: "a" * 64)).to be false
    expect(session.authorized?(user: user)).to be true
  end

  it "rejects mismatched order, identity, amount, currency and snapshot bindings" do
    attrs = { checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot" }
    [{order: create(:order)}, {requested_cents: 1499}, {currency: "EUR"}, {payload_digest: "changed"}, {payment_identity: PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "other", profile_key: "other", credential_reference: "stripe_default")}].each do |change|
      expect(PaymentAttempt.new(**attrs, **change)).not_to be_valid
    end
  end

  it "makes identity and attempt bindings immutable" do
    identity.save!
    expect { identity.update!(environment: "simulated") }.to raise_error(ActiveRecord::ReadonlyAttributeError)
    expect { attempt.update!(requested_cents: 1) }.to raise_error(ActiveRecord::ReadonlyAttributeError)
  end

  it "allocates stable independent numeric operation references" do
    first = attempt.reference_number
    attempt.update!(state: "failed")
    second = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot")
    expect(second.reference_number).to be > first
    expect(second.reference_number.to_s.length).to be <= 19
    expect(attempt.reload.reference_number).to eq(first)
  end

  it "enforces one active collection even when validation is bypassed" do
    attempt
    expect do
      PaymentAttempt.transaction(requires_new: true) { PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot") }
    end.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "uniquely records a charge in its account/environment namespace" do
    attrs = { payment_identity: identity, payment_attempt: attempt, provider: "stripe", raw_provider_id: "pi_fixture", reference: identity.canonical_reference("pi_fixture"), currency: "USD", amount_cents: 1500, state: "captured", first_observed_at: Time.current, last_observed_at: Time.current }
    PaymentTransaction.create!(**attrs)
    expect do
      PaymentTransaction.transaction(requires_new: true) { PaymentTransaction.create!(**attrs) }
    end.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "only consumes a charge for its original order and never unconsumes it" do
    attrs = { payment_identity: identity, payment_attempt: attempt, provider: "stripe", raw_provider_id: "pi_bound", reference: identity.canonical_reference("pi_bound"), currency: "USD", amount_cents: 1500, state: "captured", first_observed_at: Time.current, last_observed_at: Time.current }
    foreign_order = create(:order)
    expect(PaymentTransaction.new(**attrs, order: foreign_order)).not_to be_valid
    charge = PaymentTransaction.create!(**attrs, order: order)
    expect { charge.update!(order: nil) }.to raise_error(ActiveRecord::RecordInvalid)
    expect do
      PaymentTransaction.transaction(requires_new: true) { PaymentTransaction.where(id: charge.id).update_all(order_id: foreign_order.id) }
    end.to raise_error(ActiveRecord::InvalidForeignKey)
  end

  it "does not treat unknown capture as paid" do
    result = Payments::Result.new(status: "unknown", identity_id: identity.id, raw_id: nil, requested_cents: 1500, approved_cents: 0, captured_cents: 0, currency: "USD", metadata: {})
    expect(result.captured?).to be false
  end

  it "never silently falls back to simulation" do
    expect { Payments::ProviderResolver.profile!(location_id: nil, channel: "online") }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    identity = PaymentIdentity.create!(provider: "worldpay", environment: "simulated", external_account_id: "fixture", profile_key: "sim", credential_reference: "none")
    expect { Payments::ProviderResolver.for_identity(identity) }.to raise_error(Payments::UnsupportedCapability)
  end

  it "fails the production boot configuration in a subprocess" do
    path = Rails.root.join("app/services/payments/configuration.rb")
    source = "require 'active_support/all'; module Rails; def self.env; ActiveSupport::StringInquirer.new('production'); end; end; require ARGV[0]; Payments::Configuration.validate_environment!"
    [{"APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => nil}, {"APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => "TEST"}, {"APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => "production", "STRIPE_SECRET_KEY" => "sk_test_fixture"}, {"APP_DEPLOYMENT_ENV" => "development"}, {"APP_DEPLOYMENT_ENV" => "production", "WORLDPAY_MODE" => "simulated"}, {"APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => "test"}, {"APP_DEPLOYMENT_ENV" => "production", "PAYMENTS_SIMULATION_ENABLED" => "true"}].each do |env|
      _, err, status = Open3.capture3(env, RbConfig.ruby, "-e", source, path.to_s)
      expect(status).not_to be_success
      expect(err).to include("UnsafeConfiguration")
    end
  end

  it "rechecks production identity authority at dispatch" do
    allow(Payments::Configuration).to receive(:production?).and_return(true)
    allow(Payments::Configuration).to receive(:validate_environment!)
    expect { Payments::ProviderResolver.for_identity(identity) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect(SiteSetting.new(payment_test_mode: true)).not_to be_valid
  end
end
