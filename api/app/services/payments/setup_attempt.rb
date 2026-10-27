# frozen_string_literal: true

module Payments
  class SetupAttempt
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      dispatch = false
      attempt.with_lock do
        return attempt if attempt.raw_provider_id.present? && attempt.collection_config.present?
        if attempt.raw_provider_id.present?
          dispatch = :recover
          next
        end
        # A dispatch interrupted by a crash is recovered by the same immutable operation key.
        if attempt.state == "created"
          attempt.update!(state: "dispatching", dispatched_at: Time.current, next_recovery_at: 1.minute.from_now)
          dispatch = true
        end
      end
      return attempt unless dispatch
      provider = ProviderResolver.for_identity(attempt.payment_identity)
      response = dispatch == :recover ? provider.collection(attempt: attempt) : provider.setup(attempt: attempt)
      attempt.with_lock do
        attempt.update!(raw_provider_id: response.fetch(:raw_id), collection_config: response.slice(:flow, :client_secret), state: %w[captured compensated].include?(attempt.state) ? attempt.state : "collecting", next_recovery_at: 30.seconds.from_now)
        attempt.order.update!(payment_intent_id: response[:raw_id], payment_reference: attempt.payment_identity.canonical_reference(response[:raw_id]), payment_session_id: attempt.checkout_session_id)
      end
      attempt
    rescue Stripe::StripeError, UnsupportedCapability, Configuration::UnsafeConfiguration => e
      attempt.with_lock { attempt.update!(state: "unknown", error_classification: e.class.name, next_recovery_at: 1.minute.from_now) }
      raise
    end
  end
end
