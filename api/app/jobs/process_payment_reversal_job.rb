class ProcessPaymentReversalJob < ApplicationJob
  queue_as :default

  # Bound retries so the job eventually lands in the dead queue for
  # manual intervention if Stripe is persistently unavailable.
  # Idempotency key prevents duplicate refunds across retries.
  # IMPORTANT: Active Job evaluates handlers in LIFO (reverse declaration)
  # order. Declare least-specific FIRST so most-specific handlers win.
  #
  # 1. StandardError (least specific — checked last at runtime)
  discard_on StandardError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_UNEXPECTED_ERROR reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  # 2. Stripe::StripeError — transient errors, retry with backoff
  retry_on Stripe::StripeError, wait: :polynomially_longer, attempts: 10
  # 3. InvalidRequestError — terminal PI states + invalid refs (more specific than StripeError)
  discard_on Stripe::InvalidRequestError do |job, error|
    if error.code == "payment_intent_unexpected_state"
      Rails.logger.error "PAYMENT_REVERSAL_PI_STATE_GAVE_UP reference=#{job.arguments.first} code=#{error.code} error=#{error.message}"
    else
      Rails.logger.error "PAYMENT_REVERSAL_INVALID_REQUEST reference=#{job.arguments.first} code=#{error.code} error=#{error.message}"
    end
  end
  # 4. Permanent Stripe config errors — most specific, checked first
  discard_on Stripe::AuthenticationError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_AUTH_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  discard_on Stripe::PermissionError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_PERMISSION_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
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
    if e.code == "charge_already_refunded"
      # Idempotent success — refund already exists. Log at info and complete.
      Rails.logger.info "PAYMENT_REVERSAL_ALREADY_REFUNDED reference=#{payment_reference} order_number=#{order_number}"
    elsif e.code == "payment_intent_unexpected_state"
      # PI state may change (e.g., after chargeback resolves) — re-raise
      # so retry_on Stripe::StripeError schedules another attempt.
      # If retries exhaust, discard_on InvalidRequestError fires with
      # a PI_STATE_GAVE_UP label instead of misleading UNEXPECTED_ERROR.
      Rails.logger.warn "PAYMENT_REVERSAL_PI_STATE_TRANSIENT reference=#{payment_reference} code=#{e.code} error=#{e.message}"
      raise
    else
      # All other InvalidRequestErrors (invalid PI id, etc.) — re-raise
      # to discard_on InvalidRequestError handler for consistent logging.
      raise
    end
  rescue Stripe::StripeError => e
    # AuthenticationError and PermissionError are permanent config failures;
    # re-raise without logging so the job-level discard_on handlers log them
    # at the correct severity. Without this guard, every permanent error
    # produces two log entries: a misleading PAYMENT_REVERSAL_FAILED
    # (implying transient) followed by the accurate AUTH/PERMISSION_FAILURE.
    raise if e.is_a?(Stripe::AuthenticationError) || e.is_a?(Stripe::PermissionError)
    Rails.logger.error "PAYMENT_REVERSAL_FAILED reference=#{payment_reference} error=#{e.class}: #{e.message}"
    raise
  end
end
