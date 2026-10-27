# frozen_string_literal: true

module Payments
  class SetupAttempt
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      return attempt if attempt.compensation_claimed_at || %w[captured compensated failed cancelled].include?(attempt.state)
      if attempt.raw_provider_id.blank? && attempt.dispatched_at.nil? && attempt.checkout_session.expires_at.past?
        raise Conflict, "Collection expired; check the saved payment before starting again"
      end
      provider = ProviderResolver.for_identity(attempt.payment_identity)
      provider.preflight(attempt: attempt) if provider.respond_to?(:preflight)
      dispatch = false
      attempt.with_lock do
        return attempt if (attempt.raw_provider_id.present? || attempt.setup_id.present?) && attempt.collection_config.present?
        if attempt.raw_provider_id.present? || attempt.setup_id.present?
          dispatch = :recover
          next
        end
        # Hosted setup creation has no verified retry/retention contract. Query
        # the original intent after a lost response; never create another page.
        if provider.respond_to?(:replay_setup?) && !provider.replay_setup? && attempt.dispatched_at
          return attempt
        end
        # A dispatch interrupted by a crash is recovered by the same immutable operation key.
        if (%w[created unknown].include?(attempt.state) && attempt.dispatched_at.nil?) || (%w[dispatching unknown].include?(attempt.state) && attempt.raw_provider_id.blank? &&
            attempt.dispatched_at && attempt.dispatched_at > 23.hours.ago && (attempt.next_recovery_at.nil? || attempt.next_recovery_at <= Time.current))
          attempt.update!(state: "dispatching", dispatched_at: attempt.dispatched_at || Time.current, next_recovery_at: 1.minute.from_now)
          dispatch = true
        end
      end
      return attempt unless dispatch
      response = dispatch == :recover ? provider.collection(attempt: attempt) : provider.setup(attempt: attempt)
      attempt.with_lock do
        raw_id = response.fetch(:raw_id, nil)
        raise BindingError, "Setup charge changed" if attempt.raw_provider_id.present? && raw_id.present? && raw_id != attempt.raw_provider_id
        attempt.update!(raw_provider_id: attempt.raw_provider_id || raw_id, setup_id: response.fetch(:setup_id, attempt.setup_id),
          hosted_url: response.fetch(:hosted_url, attempt.hosted_url), provider_metadata: attempt.provider_metadata.merge(response.fetch(:provider_metadata, {})),
          collection_config: response.slice(:flow, :client_secret, :hosted_url), state: %w[captured compensated compensation_required reconciliation_required cancelled failed].include?(attempt.state) || attempt.compensation_claimed_at ? attempt.state : "collecting", next_recovery_at: 30.seconds.from_now)
        attrs = { payment_session_id: attempt.checkout_session_id }
        attrs.merge!(payment_intent_id: raw_id, payment_reference: attempt.payment_identity.canonical_reference(raw_id)) if raw_id.present?
        attempt.order.update!(attrs)
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
