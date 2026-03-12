class ProcessPaymentReversalJob < ApplicationJob
  queue_as :default

  # Bound retries so the job eventually lands in the dead queue for
  # manual intervention if Stripe is persistently unavailable.
  # Idempotency key prevents duplicate refunds across retries.
  # Permanent Stripe config errors — will never self-heal through retries.
  # Discard immediately so the job lands in the dead queue for manual
  # intervention instead of burning ~10-15 minutes of polynomial backoff
  # while a customer sits charged with no refund in flight.
  discard_on Stripe::AuthenticationError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_AUTH_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  discard_on Stripe::PermissionError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_PERMISSION_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  # Transient Stripe errors (network, rate limit, API errors) — retry with backoff.
  retry_on Stripe::StripeError, wait: :polynomially_longer, attempts: 10
  # Non-Stripe exceptions (OpenSSL, SocketError, etc.) — not retriable.
  discard_on StandardError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_UNEXPECTED_ERROR reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end

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
    # Distinguish idempotent success (already refunded) from genuinely
    # invalid requests so logs stay clean while real errors are visible.
    if e.code == "charge_already_refunded"
      Rails.logger.info "PAYMENT_REVERSAL_ALREADY_REFUNDED reference=#{payment_reference} order_number=#{order_number}"
    elsif e.code == "payment_intent_unexpected_state"
      # PI state may change (e.g., after chargeback resolves) — re-raise
      # so retry_on Stripe::StripeError schedules another attempt.
      Rails.logger.warn "PAYMENT_REVERSAL_PI_STATE_TRANSIENT reference=#{payment_reference} code=#{e.code} error=#{e.message}"
      raise
    else
      # Truly terminal InvalidRequestError (invalid PI id, etc.) — log
      # with e.code for incident response and let the job complete.
      Rails.logger.error "PAYMENT_REVERSAL_INVALID_REQUEST reference=#{payment_reference} code=#{e.code} error=#{e.class}: #{e.message}"
    end
  rescue Stripe::StripeError => e
    Rails.logger.error "PAYMENT_REVERSAL_FAILED reference=#{payment_reference} error=#{e.class}: #{e.message}"
    raise
  end
end
