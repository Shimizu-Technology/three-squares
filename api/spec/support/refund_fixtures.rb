# frozen_string_literal: true

module RefundFixtures
  def captured_order(amount: 1500, reference: "pi_#{SecureRandom.hex(8)}", environment: "sandbox")
    identity = PaymentIdentity.create!(provider: "stripe", environment: environment, external_account_id: "acct_refund_fixture", profile_key: SecureRandom.uuid, credential_reference: "stripe_default")
    order = create(:order, payment_status: "paid", payment_method: "stripe", total_cents: amount,
      payment_identity_id: identity.id, payment_environment: environment)
    session = CheckoutSession.create!(order: order, payment_identity: identity, owner_key: SecureRandom.uuid,
      guest_capability_digest: "digest", caller_idempotency_key: SecureRandom.uuid, snapshot_digest: "snapshot",
      amount_cents: amount, expires_at: 1.hour.from_now)
    attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity,
      requested_cents: amount, approved_cents: amount, captured_cents: amount, state: "captured",
      raw_provider_id: reference, payload_digest: "snapshot")
    charge = PaymentTransaction.create!(payment_identity: identity, payment_attempt: attempt, order: order,
      provider: "stripe", raw_provider_id: reference, reference: identity.canonical_reference(reference),
      amount_cents: amount, currency: "USD", state: "captured", first_observed_at: Time.current, last_observed_at: Time.current)
    order.update!(checkout_session_id: session.id, payment_attempt_id: attempt.id, payment_reference: reference)
    [ order, identity, attempt, charge ]
  end
end
