# frozen_string_literal: true

module Payments
  class SetupAttempt
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      if attempt.raw_provider_id.blank? && attempt.dispatched_at.nil? && attempt.checkout_session.expires_at.past?
        raise Conflict, 'Collection expired; check the saved payment before starting again'
      end
      dispatch = false
      attempt.with_lock do
        return attempt if attempt.raw_provider_id.present? && attempt.collection_config.present?
        if attempt.raw_provider_id.present?
          dispatch = :recover
          next
        end
        # A dispatch interrupted by a crash is recovered by the same immutable operation key.
        if (%w[created unknown].include?(attempt.state) && attempt.dispatched_at.nil?) || (%w[dispatching unknown].include?(attempt.state) && attempt.raw_provider_id.blank? &&
            attempt.dispatched_at && attempt.dispatched_at > 23.hours.ago && (attempt.next_recovery_at.nil? || attempt.next_recovery_at <= Time.current))
          attempt.update!(state: "dispatching", dispatched_at: attempt.dispatched_at || Time.current, next_recovery_at: 1.minute.from_now)
          dispatch = true
        end
      end
      return attempt unless dispatch
      provider = ProviderResolver.for_identity(attempt.payment_identity)
      response = dispatch == :recover ? provider.collection(attempt: attempt) : provider.setup(attempt: attempt)
      attempt.with_lock do
        attempt.update!(raw_provider_id: response.fetch(:raw_id), collection_config: response.slice(:flow, :client_secret), state: %w[captured compensated compensation_required reconciliation_required cancelled failed].include?(attempt.state) || attempt.compensation_claimed_at ? attempt.state : "collecting", next_recovery_at: 30.seconds.from_now)
        attempt.order.update!(payment_intent_id: response[:raw_id], payment_reference: attempt.payment_identity.canonical_reference(response[:raw_id]), payment_session_id: attempt.checkout_session_id)
      end
      attempt
    rescue Stripe::StripeError, UnsupportedCapability, Configuration::UnsafeConfiguration => e
      attempt.with_lock do
        unless attempt.compensation_claimed_at || %w[captured compensated compensation_required reconciliation_required cancelled failed].include?(attempt.state)
          attempt.update!(state: "unknown", error_classification: e.class.name, next_recovery_at: 1.minute.from_now)
        end
      end
      raise
    end
  end
end
