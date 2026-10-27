# frozen_string_literal: true

module Payments
  # The online ingress exposes this only after the decision transaction returns.
  # Nested callers must commit their outer transaction before advertising that
  # no concurrent request using this key can later dispatch financial setup.
  class CheckoutRejected < Error; end
end
