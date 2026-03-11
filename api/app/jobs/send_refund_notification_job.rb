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

    # --- Email channel (atomic idempotency) ---
    if settings.enable_order_emails && order.customer_email.present?
      rows = Order.where(id: order.id, refund_email_sent: false)
                  .update_all(refund_email_sent: true)
      if rows > 0
        result = EmailService.send_refund_notification(order, refund_amount_cents, reason)
        unless result.is_a?(Hash) && result[:success]
          order.update_column(:refund_email_sent, false)
          errors << "Email: #{result&.dig(:error) || 'unknown error'}"
        end
      end
    end

    # --- SMS channel (atomic idempotency, matching email pattern) ---
    # --- SMS channel (atomic idempotency, with pre-guard to avoid unnecessary DB writes) ---
    if settings.enable_order_sms && order.customer_phone.present?
      begin
        sms_rows = Order.where(id: order.id, refund_sms_sent: false)
                        .update_all(refund_sms_sent: true)
        if sms_rows > 0
          sms_result = SmsService.send_refund_notification(order, refund_amount_cents)
          unless sms_result.is_a?(Hash) && sms_result[:success]
            order.update_column(:refund_sms_sent, false)
            errors << "SMS: #{sms_result&.dig(:error) || 'unknown error'}" unless sms_result&.dig(:skipped)
          end
        end
      rescue StandardError => e
        order.update_column(:refund_sms_sent, false)
        errors << "SMS: #{e.message}"
        Rails.logger.error "❌ Refund SMS failed for order ##{order.order_number}: #{e.message}"
      end
    end

    if errors.any?
      raise "Refund notification failed: #{errors.join('; ')}"
    end
  end
end
