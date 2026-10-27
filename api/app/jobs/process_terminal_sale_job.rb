# frozen_string_literal: true

class ProcessTerminalSaleJob < ApplicationJob
  queue_as :payments

  def perform(attempt_id)
    attempt = PaymentAttempt.find(attempt_id)
    Payments::Configuration.validate_identity!(attempt.payment_identity)
    Payments::DispatchTerminalSale.call(attempt: attempt)
  end
end
