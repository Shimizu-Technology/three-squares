# frozen_string_literal: true

module Payments
  class PrepareTerminalAttempt
    def self.call(attempt:, provider:)
      return attempt if attempt.collection_config['flow'] == 'terminal'
      response = provider.setup(attempt: attempt) # Local preparation, never a sale.
      AttemptLock.call(attempt) do |session, current, _, order|
        AttemptLock.validate!(session, current, order)
        next current if current.compensation_claimed_at || %w[captured compensated failed cancelled].include?(current.state)
        raw_id = response[:raw_id]
        raise BindingError, 'Prepared terminal charge changed' if current.raw_provider_id && raw_id && current.raw_provider_id != raw_id
        current.update!(raw_provider_id: current.raw_provider_id || raw_id,
          collection_config: response.slice(:flow, :client_secret, :terminal_id), state: 'collecting', next_recovery_at: 1.minute.from_now)
        order.update!(payment_session_id: session.id)
        current
      end
      attempt.reload
    end
  end
end
