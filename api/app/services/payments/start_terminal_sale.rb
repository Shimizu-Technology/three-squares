# frozen_string_literal: true

module Payments
  class StartTerminalSale
    def self.call(attempt:)
      provider = ProviderResolver.for_attempt(attempt)
      raise UnsupportedCapability, 'Original reader binding requires reconciliation' unless provider.respond_to?(:async_terminal?)
      provider.preflight(attempt: attempt)
      SetupAttempt.call(attempt: attempt)
      AttemptLock.call(attempt) do |session, current, _, order|
        AttemptLock.validate!(session, current, order)
        next current if %w[captured compensated failed cancelled].include?(current.state)
        raise Conflict, 'Cancellation is being checked. Do not start another collection.' if current.cancel_requested_at
        raise Conflict, 'Collection expired. Check the saved order.' if !current.dispatched_at && session.expires_at.past?
        TerminalLease.reserve_locked!(current) unless current.dispatched_at && current.payment_terminal&.leased_attempt_id == current.id
        if provider.async_terminal?
          PaymentOutbox.record!(effect_key: "attempt:#{current.id}:terminal_sale", kind: 'terminal_sale', payload: {'attempt_id' => current.id})
        end
        current
      end
      attempt.reload
    end
  end
end
