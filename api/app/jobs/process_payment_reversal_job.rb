class ProcessPaymentReversalJob < ApplicationJob
  queue_as :default

  def perform(payment_reference, order_number = "pending")
    return if payment_reference.blank?
    return unless payment_reference.start_with?("pi_", "ch_")

    refund_args = if payment_reference.start_with?("pi_")
                    { payment_intent: payment_reference }
                  else
                    { charge: payment_reference }
                  end

    idempotency_key = "order-finalize-failed-refund:#{payment_reference}"
    Stripe::Refund.create(
      refund_args.merge(
        reason: "requested_by_customer",
        metadata: {
          reconciliation_reason: "order_finalize_failed",
          order_number: order_number
        }
      ),
      { idempotency_key: idempotency_key }
    )

    Rails.logger.info "PAYMENT_REVERSAL_ATTEMPTED reference=#{payment_reference} order_number=#{order_number}"
  rescue Stripe::InvalidRequestError => e
    # Invalid references are not retriable; keep visibility and exit.
    Rails.logger.error "PAYMENT_REVERSAL_INVALID_REQUEST reference=#{payment_reference} error=#{e.class}: #{e.message}"
  rescue Stripe::StripeError => e
    Rails.logger.error "PAYMENT_REVERSAL_FAILED reference=#{payment_reference} error=#{e.class}: #{e.message}"
    raise
  end
end
