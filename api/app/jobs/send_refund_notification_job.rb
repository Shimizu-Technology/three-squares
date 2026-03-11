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

    # Send SMS first — SmsService can raise, and we don't want a successful
    # email to be re-sent if the job retries due to an SMS failure.
    begin
      SmsService.send_refund_notification(order, refund_amount_cents)
    rescue StandardError => e
      errors << "SMS: #{e.message}"
      Rails.logger.error "❌ Refund SMS failed for order ##{order.order_number}: #{e.message}"
    end

    # Send email notification
    if settings.enable_order_emails && order.customer_email.present?
      result = EmailService.send_refund_notification(order, refund_amount_cents, reason)
      unless result.is_a?(Hash) && result[:success]
        errors << "Email: #{result&.dig(:error) || 'unknown error'}"
        Rails.logger.error "❌ Refund email failed for order ##{order.order_number}: #{result&.dig(:error)}"
      end
    end

    # If both channels failed, raise so the job retries
    raise "Refund notification failed: #{errors.join('; ')}" if errors.length == 2
  end
end
