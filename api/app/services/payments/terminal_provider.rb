# frozen_string_literal: true

module Payments
  # The persisted identity remains the adapter authority. This service adds lane
  # ownership without changing the common result/finalization/refund contracts.
  class TerminalProvider < BaseProvider
    def adapter
      @adapter ||= if identity.environment == 'simulated'
        Simulation::Provider.new(identity)
      elsif identity.provider == 'stripe'
        StripeProvider.new(identity)
      else
        Worldpay::TriPosProvider.new(identity)
      end
    end

    def async_terminal? = identity.provider == 'worldpay' || identity.environment == 'simulated'
    def replay_setup? = !async_terminal?
    def replay_reversal? = identity.environment == 'simulated' || identity.provider == 'stripe'

    def preflight(attempt:)
      TerminalContext.validate!(attempt: attempt)
      adapter.preflight(attempt: attempt)
    end

    def setup(attempt:)
      TerminalContext.validate!(attempt: attempt)
      return adapter.setup(attempt: attempt) unless async_terminal?
      local = identity.environment == 'simulated' ? adapter.setup(attempt: attempt) : {}
      local.merge(flow: 'terminal', terminal_id: attempt.payment_terminal_id)
    end

    def collection(attempt:)
      return setup(attempt: attempt) if async_terminal?
      TerminalContext.validate!(attempt: attempt)
      adapter.collection(attempt: attempt)
    end

    def sale(attempt:)
      TerminalContext.validate!(attempt: attempt)
      return adapter.query(attempt: attempt) if identity.environment == 'simulated'
      raise UnsupportedCapability, 'Stripe Terminal collection uses its approved SDK adapter' if identity.provider == 'stripe'
      adapter.sale(attempt: attempt)
    end

    def query(attempt:)
      TerminalContext.validate!(attempt: attempt)
      adapter.query(attempt: attempt)
    end

    # Simulator commands still use opaque handles and the same finalizer.
    def collect(attempt:, **options)
      TerminalContext.validate!(attempt: attempt)
      raise UnsupportedCapability, 'Developer reader commands are simulation only' unless identity.environment == 'simulated'
      unless attempt.dispatched_at && attempt.payment_terminal.leased_attempt_id == attempt.id
        raise Conflict, 'Start the saved payment on its original reader before presenting a card'
      end
      adapter.collect(attempt: attempt, **options)
    end

    def cancel(attempt:)
      TerminalContext.validate!(attempt: attempt)
      adapter.cancel(attempt: attempt)
    end

    def reverse(attempt:, operation_key:)
      TerminalContext.validate!(attempt: attempt)
      adapter.reverse(attempt: attempt, operation_key: operation_key)
    end

    def query_reversal(attempt:, operation_key:)
      TerminalContext.validate!(attempt: attempt)
      adapter.query_reversal(attempt: attempt, operation_key: operation_key)
    end

    def refund(**options) = adapter.refund(**options)
    def query_refund(**options) = adapter.query_refund(**options)
    def query_original_charge(**options) = adapter.query_original_charge(**options)
  end
end
