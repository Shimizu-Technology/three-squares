# frozen_string_literal: true

module Payments
  class CancelCheckout
    def self.call(attempt:)
      Configuration.validate_identity!(attempt.payment_identity)
      # Query and cancel the original identity/reference; the finalizer resolves
      # any late approval. Cancellation never clears evidence or releases unknown money.
      result = ProviderResolver.for_identity(attempt.payment_identity).cancel(attempt: attempt)
      FinalizeOrder.call(attempt: attempt, result: result)
    end
  end
end
