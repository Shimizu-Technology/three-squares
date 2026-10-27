# frozen_string_literal: true

module Payments
  class DispatchTerminalSale
    def self.call(attempt:)
      provider = ProviderResolver.for_attempt(attempt)
      raise BindingError, 'Expected a server-dispatched terminal collection' unless provider.respond_to?(:async_terminal?) && provider.async_terminal?
      provider.preflight(attempt: attempt)
      dispatch = AttemptLock.call(attempt) do |session, current, _, order|
        AttemptLock.validate!(session, current, order)
        next nil if current.compensation_claimed_at || %w[captured compensated failed cancelled].include?(current.state)
        next :query if current.dispatched_at
        if current.cancel_requested_at || session.expires_at.past?
          current.update!(state: 'cancelled', next_recovery_at: nil)
          session.update!(state: 'cancelled')
          InventoryReservation.where(order_id: order.id, state: 'held').update_all(state: 'released', updated_at: Time.current)
          next nil
        end
        Snapshot.validate!(session: session, attempt: current, order: order)
        terminal = TerminalLease.reserve_locked!(current)
        terminal.update!(status: 'processing')
        current.update!(state: 'dispatching', dispatched_at: Time.current, next_recovery_at: 1.minute.from_now)
        :sale
      end
      return unless dispatch
      # The committed claim is deliberately before transmission. A death on
      # either side of this boundary permits queries, never another sale.
      result = dispatch == :sale ? provider.sale(attempt: attempt.reload) : provider.query(attempt: attempt.reload)
      FinalizeOrder.call(attempt: attempt, result: result)
    rescue StandardError => error
      AttemptLock.call(attempt) do |_, current, _, _|
        unless current.compensation_claimed_at || %w[captured compensated failed cancelled].include?(current.state)
          current.update!(state: current.dispatched_at ? 'unknown' : current.state, last_error: error.class.name, next_recovery_at: 1.minute.from_now)
        end
      end
      raise
    ensure
      TerminalLease.release_resolved(attempt)
      terminal = attempt.payment_terminal
      terminal&.with_lock do
        if terminal.leased_attempt_id == attempt.id && terminal.status == 'processing' && !terminal.command_token &&
            (attempt.reload.state == 'collecting' || result&.metadata&.dig(:reader_state) == 'waiting_for_card')
          terminal.update!(status: 'waiting_for_card')
        end
      end
    end
  end
end
