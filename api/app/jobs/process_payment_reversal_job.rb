# frozen_string_literal: true

class ProcessPaymentReversalJob < ApplicationJob
  queue_as :payments
  retry_on StandardError, wait: :polynomially_longer, attempts: 10
  discard_on Payments::BindingError, ActiveRecord::RecordNotFound do |_job, error|
    Rails.logger.error("Payment reversal rejected; manual reconciliation required error=#{error.class}")
  end

  # UUID is the persisted attempt ID. Raw legacy references fail closed: no lookup
  # by a caller supplied pi_/ch_ reference and no direct Stripe reversal.
  def perform(attempt_id, _legacy_order_number = nil)
    unless attempt_id.is_a?(String) && attempt_id.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i)
      raise Payments::BindingError, 'Unbound legacy reversal requires manual reconciliation'
    end
    Payments::CompensateAttempt.call(attempt: PaymentAttempt.find(attempt_id))
  end
end
