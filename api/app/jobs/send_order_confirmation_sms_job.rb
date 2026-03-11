# frozen_string_literal: true

# Dedicated job for the initial "order placed" SMS — uses its own boolean
# flag (confirmation_sms_sent) instead of the seq system.
class SendOrderConfirmationSmsJob < ApplicationJob
  queue_as :default

  # Custom error for retriable skip conditions
  class SmsTemporarilyUnavailable < StandardError; end

  # Rails matches retry_on in LIFO (last-declared-first) order.
  # StandardError MUST be declared first so the more-specific handler wins.
  retry_on StandardError, wait: :polynomially_longer, attempts: 5

  # Temporary unavailability — log on exhaustion instead of dead job queue
  retry_on SmsTemporarilyUnavailable, wait: :polynomially_longer, attempts: 5 do |job, error|
    Rails.logger.warn "⚠️ SendOrderConfirmationSmsJob exhausted retries for order ##{job.arguments[0]}: #{error.message}"
  end
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency
    rows = Order.where(id: order.id, confirmation_sms_sent: false)
                .update_all(confirmation_sms_sent: true)
    return if rows == 0

    begin
      result = SmsService.send_order_confirmation(order)

      if result.is_a?(Hash) && result[:success]
        Rails.logger.info "✅ Confirmation SMS sent for order ##{order.order_number}"
      elsif result&.dig(:permanent)
        # Permanent skip (missing credentials, invalid phone) — don't retry.
        Order.where(id: order.id, confirmation_sms_sent: true)
             .update_all(confirmation_sms_sent: false)
        Rails.logger.info "⏭️ Confirmation SMS permanently skipped for order ##{order.order_number}: #{result[:reason]}"
      elsif result&.dig(:skipped)
        # Transient skip (toggle off) — retry in case it's re-enabled
        Order.where(id: order.id, confirmation_sms_sent: true)
             .update_all(confirmation_sms_sent: false)
        raise SmsTemporarilyUnavailable, "SMS skipped: #{result[:reason]} — will retry"
      else
        Order.where(id: order.id, confirmation_sms_sent: true)
             .update_all(confirmation_sms_sent: false)
        raise "SMS failed: #{result&.dig(:reason) || 'unknown error'}"
      end
    rescue SmsTemporarilyUnavailable
      raise # Let retry_on handle it
    rescue StandardError => e
      Order.where(id: order.id, confirmation_sms_sent: true)
           .update_all(confirmation_sms_sent: false)
      raise
    end
  end
end
