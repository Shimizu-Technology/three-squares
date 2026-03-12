class ProcessPaymentReversalJob < ApplicationJob
  queue_as :default

  # Bound retries so the job eventually lands in the dead queue for
  # manual intervention if Stripe is persistently unavailable.
  # Idempotency key prevents duplicate refunds across retries.
  retry_on Stripe::StripeError, wait: :polynomially_longer, attempts: 10

  def perform(payment_reference, order_number = "pending")
    return if payment_reference.blank?
    return unless payment_reference.start_with?("pi_", "ch_")

    refund_args = if payment_reference.start_with?("pi_")
                    { payment_intent: payment_reference }
                  else
                    { charge: payment_reference }
                  end

    idempotency_key = "order-finalize-failed-refund:#{payment_reference}"
    # Omit the `reason` field — Stripe's built-in reasons don't include
    # "system error reversal." Using "requested_by_customer" is misleading
    # and can affect dispute/chargeback signals. The metadata block
    # documents the true cause for auditing.
    Stripe::Refund.create(
      refund_args.merge(
        metadata: {
          reconciliation_reason: "order_finalize_failed",
          order_number: order_number,
          initiated_by: "system_auto_reversal"
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
