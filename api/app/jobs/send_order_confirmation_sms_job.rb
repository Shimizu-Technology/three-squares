# frozen_string_literal: true

# Dedicated job for the initial "order placed" SMS — uses its own boolean
# flag (confirmation_sms_sent) instead of the seq system.
class SendOrderConfirmationSmsJob < ApplicationJob
  queue_as :default

  # Retry with increasing backoff — covers temporary SMS outages and
  # the case where enable_order_sms is toggled off then back on.
  retry_on StandardError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound

  # Custom error for retriable skip conditions
  class SmsTemporarilyUnavailable < StandardError; end

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
      elsif result&.dig(:skipped)
        # SMS is disabled or phone invalid — roll back flag and raise so
        # retry_on fires. If SMS is re-enabled within the retry window,
        # the customer still gets their confirmation.
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
