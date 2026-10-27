require "rails_helper"

RSpec.describe Payments::StripeProvider do
  let(:identity) { PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_fixture", profile_key: SecureRandom.uuid, credential_reference: "stripe_default") }
  let(:order) { create(:order) }
  let(:session) { CheckoutSession.create!(order: order, payment_identity: identity, owner_key: "fixture", guest_capability_digest: "digest", caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot", amount_cents: 1500, expires_at: 1.hour.from_now) }
  let(:attempt) { PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot") }
  let(:provider) { described_class.new(identity) }
  let(:intents_api) { double("Stripe PaymentIntent client") }
  let(:stripe_client) { double("Stripe client", v1: double(payment_intents: intents_api)) }
  let(:intent) do
    Stripe::StripeObject.construct_from(id: "pi_fixture", amount: 1500, amount_received: 1500, currency: "usd", status: "succeeded", livemode: false, client_secret: "fixture_secret",
      metadata: { checkout_session_id: session.id, payment_attempt_id: attempt.id, payment_identity_id: identity.id, order_id: order.id.to_s, snapshot_digest: "snapshot" })
  end
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("STRIPE_SECRET_KEY_TEST").and_return("sk_test_fixture")
    allow(Stripe::StripeClient).to receive(:new).with("sk_test_fixture", stripe_account: "acct_fixture").and_return(stripe_client)
  end

  it "sets account context and stable operation idempotency on setup" do
    expect(intents_api).to receive(:create).with(hash_including(amount: 1500, metadata: hash_including(order_id: order.id, payment_attempt_id: attempt.id)), hash_including(idempotency_key: attempt.operation_key)).and_return(intent)
    expect(provider.setup(attempt: attempt)).to include(raw_id: "pi_fixture", flow: "stripe_embedded")
  end

  it "requires exact amount, currency, environment and all immutable metadata" do
    expect(provider.validate_binding!(intent, attempt)).to be true
    [{amount: 1501}, {currency: "eur"}, {livemode: true}, {metadata: {}}, {metadata: intent.metadata.to_h.merge(payment_attempt_id: SecureRandom.uuid)}].each do |change|
      wrong = Stripe::StripeObject.construct_from(intent.to_h.merge(change))
      expect { provider.validate_binding!(wrong, attempt) }.to raise_error(Payments::BindingError)
    end
  end

  it "rejects a different adapter account before sending any request" do
    other = PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_other", profile_key: "other", credential_reference: "stripe_default")
    wrong = described_class.new(other)
    expect(intents_api).not_to receive(:create)
    expect(intents_api).not_to receive(:retrieve)
    expect { wrong.setup(attempt: attempt) }.to raise_error(Payments::BindingError)
    expect { wrong.query(attempt: attempt) }.to raise_error(Payments::BindingError)
    expect { wrong.validate_binding!(intent, attempt) }.to raise_error(Payments::BindingError)
  end

  it "requires actual captured cents for payment success" do
    attempt.update!(raw_provider_id: "pi_fixture")
    allow(intents_api).to receive(:retrieve).and_return(intent)
    expect(provider.query(attempt: attempt).captured?).to be true
    intent.amount_received = 1499
    expect(provider.query(attempt: attempt).captured?).to be false
    intent.status = "requires_capture"
    expect(provider.query(attempt: attempt).captured?).to be false
  end
  it 'rejects a recovered reversal that belongs to another original intent' do
    attempt.update!(raw_provider_id: 'pi_fixture', compensation_provider_id: 're_fixture')
    refunds = double('refunds')
    allow(stripe_client.v1).to receive(:refunds).and_return(refunds)
    allow(refunds).to receive(:retrieve).with('re_fixture').and_return(Stripe::StripeObject.construct_from(
      id: 're_fixture', amount: 1500, currency: 'usd', status: 'succeeded', payment_intent: 'pi_other', metadata: { operation_key: 'same_key' }))
    expect { provider.query_reversal(attempt: attempt, operation_key: 'same_key') }.to raise_error(Payments::BindingError)
  end

end
