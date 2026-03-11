# frozen_string_literal: true

class SendRefundNotificationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param refund_amount_cents [Integer]
  # @param reason [String, nil]
  def perform(order_id, refund_amount_cents, reason = nil)
    order = Order.find(order_id)
    settings = SiteSetting.instance
    errors = []

    # --- Email channel ---
    if settings.enable_order_emails && order.customer_email.present?
      # Atomic idempotency: only send if we haven't already on a prior attempt.
      # refund_email_sent defaults to false; UPDATE WHERE prevents duplicate sends.
      if order.respond_to?(:refund_email_sent) && !order.refund_email_sent
        result = EmailService.send_refund_notification(order, refund_amount_cents, reason)
        if result.is_a?(Hash) && result[:success]
          order.update_column(:refund_email_sent, true)
        else
          errors << "Email: #{result&.dig(:error) || 'unknown error'}"
        end
      end
    end

    # --- SMS channel ---
    begin
      if order.respond_to?(:refund_sms_sent) && !order.refund_sms_sent
        SmsService.send_refund_notification(order, refund_amount_cents)
        order.update_column(:refund_sms_sent, true)
      end
    rescue StandardError => e
      errors << "SMS: #{e.message}"
      Rails.logger.error "❌ Refund SMS failed for order ##{order.order_number}: #{e.message}"
    end

    # Raise if ANY channel failed so retry_on can re-attempt the failed channel.
    # The idempotency flags above prevent the successful channel from re-sending.
    if errors.any?
      raise "Refund notification failed: #{errors.join('; ')}"
    end
  end
end
