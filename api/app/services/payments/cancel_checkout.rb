# frozen_string_literal: true

module Payments
  class CancelCheckout
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      return attempt.order if %w[failed cancelled compensated].include?(attempt.state)
      provider = ProviderResolver.for_attempt(attempt)
      if attempt.collection_mode == 'terminal' && attempt.snapshot.dig('collection', 'terminal')
        local = AttemptLock.call(attempt) do |session, current, _, order|
          AttemptLock.validate!(session, current, order)
          next order if order.inventory_committed_at || %w[captured compensated failed cancelled].include?(current.state)
          current.update!(cancel_requested_at: current.cancel_requested_at || Time.current)
          if !current.dispatched_at && provider.async_terminal?
            current.update!(state: 'cancelled', next_recovery_at: nil)
            session.update!(state: 'cancelled')
            InventoryReservation.where(order_id: order.id, state: 'held').update_all(state: 'released', updated_at: Time.current)
            next order
          end
          nil
        end
        return local if local
      end
      # Query and cancel the original identity/reference; the finalizer resolves
      # any late approval. Cancellation never clears evidence or releases unknown money.
      result = provider.cancel(attempt: attempt.reload)
      FinalizeOrder.call(attempt: attempt, result: result)
    ensure
      TerminalLease.release_resolved(attempt) if attempt.payment_terminal_id
    end
  end
end
