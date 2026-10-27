# frozen_string_literal: true

module Payments
  class SetupAttempt
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      return attempt if attempt.compensation_claimed_at || %w[captured compensated failed cancelled].include?(attempt.state)
      return attempt.reload if cancel_gated_undispatched(attempt)
      if attempt.raw_provider_id.blank? && attempt.dispatched_at.nil? && attempt.checkout_session.expires_at.past?
        raise Conflict, "Collection expired; check the saved payment before starting again"
      end
      provider = ProviderResolver.for_attempt(attempt)
      provider.preflight(attempt: attempt) if provider.respond_to?(:preflight)
      return PrepareTerminalAttempt.call(attempt: attempt, provider: provider) if provider.respond_to?(:async_terminal?) && provider.async_terminal?
      dispatch = false
      attempt.with_lock do
        if attempt.checkout_session.channel == "online" && attempt.dispatched_at.nil? && attempt.raw_provider_id.blank? && attempt.setup_id.blank?
          # Serialize the first dispatch decision with an owner's pause save.
          settings = SiteSetting.lock("FOR SHARE").find(SiteSetting.instance.id)
          raise FulfillmentError, OnlineOrderingAvailability.message(settings) if settings.online_ordering_paused?
        end
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

    def self.cancel_gated_undispatched(attempt)
      AttemptLock.call(attempt) do |session, current, charge, order|
        # Only untouched intent can be closed locally. Dispatched, ambiguous or
        # financial attempts retain the existing provider recovery path.
        next false unless session.channel == "online" && %w[created unknown].include?(current.state)
        next false if current.raw_provider_id.present? || current.setup_id.present? || current.dispatched_at || charge ||
          current.approved_cents.positive? || current.captured_cents.positive? || current.compensation_claimed_at
        settings = SiteSetting.instance
        paused = settings.online_ordering_paused?
        next false if !paused && StorefrontEligibility.online_ordering_enabled_for_order?(order)
        reason = paused ? "online_ordering_paused" : "catering_inquiry_required"
        message = paused ? OnlineOrderingAvailability.message(settings) : StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE

        UpdateOrder.call(order: order, attributes: {
          status: "cancelled",
          metadata: order.metadata.merge("system_cancellation" => { "actor" => "system", "reason" => reason })
        }, user: nil, notify: false)
        current.update!(state: "cancelled", error_classification: reason,
          last_error: message, next_recovery_at: nil)
        session.update!(state: "cancelled")
        true
      end
    end
  end
end
