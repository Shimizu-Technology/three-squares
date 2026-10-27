# frozen_string_literal: true

module Api
  module V1
    # Compatibility URL using the durable checkout contract. Raw amount-only intent
    # creation is retired: no payment may precede persisted order ownership.
    class PaymentIntentsController < CheckoutSessionsController
    end
  end
end
