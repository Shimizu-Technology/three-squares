require "rails_helper"

RSpec.describe "Concurrent charge observation" do
  self.use_transactional_tests = false

  it "permits only one provider reference under concurrent inserts" do
    identity = PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_race", profile_key: SecureRandom.uuid, credential_reference: "stripe_default")
    order = create(:order)
    session = CheckoutSession.create!(order: order, payment_identity: identity, owner_key: SecureRandom.hex(32), guest_capability_digest: "digest", caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot", amount_cents: 1500, expires_at: 1.hour.from_now)
    attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: "snapshot")
    gate = Queue.new
    ready = Queue.new
    results = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          gate.pop
          begin
            PaymentTransaction.create!(payment_identity_id: identity.id, payment_attempt_id: attempt.id, provider: "stripe", raw_provider_id: "pi_race", reference: identity.canonical_reference("pi_race"), currency: "USD", amount_cents: 1500, state: "captured", first_observed_at: Time.current, last_observed_at: Time.current)
            :inserted
          rescue ActiveRecord::RecordNotUnique
            :duplicate
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { gate << true }
    expect(results.map(&:value).sort).to eq([:duplicate, :inserted])
    expect(PaymentTransaction.where(payment_identity: identity).count).to eq(1)
  ensure
    PaymentTransaction.where(payment_identity: identity).delete_all if identity
    PaymentAttempt.where(id: attempt&.id).delete_all
    CheckoutSession.where(id: session&.id).delete_all
    Order.where(id: order&.id).delete_all
    PaymentIdentity.where(id: identity&.id).delete_all
  end
end
