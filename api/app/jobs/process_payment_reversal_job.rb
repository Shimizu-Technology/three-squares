class ProcessPaymentReversalJob < ApplicationJob
  queue_as :default

  # IMPORTANT: Active Job evaluates handlers in LIFO (reverse declaration)
  # order. Declare least-specific FIRST so most-specific handlers win.
  #
  # 1. StandardError (least specific — checked last at runtime)
  discard_on StandardError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_UNEXPECTED_ERROR reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  # 2. Stripe::StripeError — transient errors, retry with backoff
  retry_on Stripe::StripeError, wait: :polynomially_longer, attempts: 10
  # 3. InvalidRequestError — declared AFTER retry_on so LIFO checks it
  #    BEFORE retry_on. Terminal errors (invalid PI id, etc.) discard
  #    immediately instead of burning 10 retries against Stripe.
  discard_on Stripe::InvalidRequestError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_TERMINAL reference=#{job.arguments.first} code=#{error.code} error=#{error.message}"
  end
  # 4. Permanent Stripe config errors — most specific, checked first
  discard_on Stripe::AuthenticationError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_AUTH_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end
  discard_on Stripe::PermissionError do |job, error|
    Rails.logger.error "PAYMENT_REVERSAL_PERMISSION_FAILURE reference=#{job.arguments.first} error=#{error.class}: #{error.message}"
  end

  # Maximum manual retries for payment_intent_unexpected_state before
  # giving up. Tracked via job metadata to survive re-enqueues.
  PI_STATE_MAX_RETRIES = 10

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
        metadata: {
          reconciliation_reason: "order_finalize_failed",
          order_number: order_number,
          initiated_by: "system_auto_reversal"
        }
      ),
      { idempotency_key: idempotency_key }
    )

    Rails.logger.info "PAYMENT_REVERSAL_ATTEMPTED reference=#{payment_reference} order_number=#{order_number}"
    # Clean up any PI state retry counter from prior attempts.
    self.class.pi_state_attempts.delete(job_id)
  rescue Stripe::InvalidRequestError => e
    if e.code == "charge_already_refunded"
      # Idempotent success — refund already exists.
      Rails.logger.info "PAYMENT_REVERSAL_ALREADY_REFUNDED reference=#{payment_reference} order_number=#{order_number}"
      self.class.pi_state_attempts.delete(job_id)
    elsif e.code == "payment_intent_unexpected_state"
      # PI state can change over time (e.g., after chargeback resolves).
      # Manual retry_job bypasses LIFO handler resolution — discard_on
      # InvalidRequestError would otherwise immediately discard.
      pi_state_attempt = (self.class.pi_state_attempts[job_id] || 0) + 1
      self.class.pi_state_attempts[job_id] = pi_state_attempt

      if pi_state_attempt <= PI_STATE_MAX_RETRIES
        wait_time = (2**[pi_state_attempt, 8].min).seconds
        Rails.logger.warn(
          "PAYMENT_REVERSAL_PI_STATE_TRANSIENT reference=#{payment_reference} " \
          "code=#{e.code} attempt=#{pi_state_attempt}/#{PI_STATE_MAX_RETRIES} " \
          "next_retry_in=#{wait_time}s"
        )
        retry_job(wait: wait_time)
      else
        self.class.pi_state_attempts.delete(job_id)
        Rails.logger.error(
          "PAYMENT_REVERSAL_PI_STATE_GAVE_UP reference=#{payment_reference} " \
          "code=#{e.code} attempts=#{PI_STATE_MAX_RETRIES} error=#{e.message}"
        )
      end
    else
      # Terminal InvalidRequestError (invalid PI id, etc.) — clean up any
      # accumulated PI state counter before re-raising to discard_on.
      self.class.pi_state_attempts.delete(job_id)
      raise
    end
  rescue Stripe::StripeError => e
    # Auth/Permission errors are permanent; re-raise without logging so
    # job-level discard_on handles them at correct severity.
    raise if e.is_a?(Stripe::AuthenticationError) || e.is_a?(Stripe::PermissionError)
    Rails.logger.error "PAYMENT_REVERSAL_FAILED reference=#{payment_reference} error=#{e.class}: #{e.message}"
    raise
  end

  # Thread-safe in-memory counter for PI state retries.
  # Acceptable for single-process workers; multi-process deployments
  # should move to job metadata or a DB counter.
  def self.pi_state_attempts
    @pi_state_attempts ||= Concurrent::Map.new
  end
end
