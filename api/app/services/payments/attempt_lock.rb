# frozen_string_literal: true

module Payments
  module AttemptLock
    def self.call(attempt, raw_id: nil)
      PaymentAttempt.transaction do
        session = CheckoutSession.lock.find(attempt.checkout_session_id)
        stored = PaymentAttempt.lock.find(attempt.id)
        scope = PaymentTransaction.where(payment_attempt_id: stored.id)
        scope = scope.or(PaymentTransaction.where(payment_identity_id: stored.payment_identity_id, raw_provider_id: raw_id)) if raw_id.present?
        charges = scope.order(:id).lock.to_a
        charge = charges.find { |row| row.payment_attempt_id == stored.id }
        order = Order.lock.find(stored.order_id)
        yield session, stored, charge, order, charges
      end
    end

    def self.validate!(session, attempt, order)
      identity = Configuration.validate_identity!(attempt.payment_identity)
      unless attempt.checkout_session_id == session.id && attempt.order_id == session.order_id &&
          attempt.payment_identity_id == session.payment_identity_id && attempt.requested_cents == session.amount_cents &&
          attempt.currency == session.currency && identity.currency == session.currency &&
          order.id == session.order_id && order.user_id == session.user_id && order.location_id == session.location_id &&
          order.payment_identity_id == identity.id && order.payment_attempt_id == attempt.id &&
          order.checkout_session_id == session.id && order.payment_environment == identity.environment &&
          order.payment_provider == identity.provider && order.simulated? == (identity.environment == 'simulated') && order.total_cents == session.amount_cents
        raise BindingError, 'Payment ownership/order binding mismatch'
      end
      Snapshot.validate!(session: session, attempt: attempt, order: order, current: false)
      identity
    end
  end
end
