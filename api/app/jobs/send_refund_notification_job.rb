# frozen_string_literal: true

class SendRefundNotificationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param refund_id [Integer] — per-refund idempotency (not per-order)
  def perform(refund_id)
    refund = Refund.find(refund_id)
    order = refund.order
    settings = SiteSetting.instance
    errors = []

    # --- Email channel (atomic per-refund idempotency) ---
    if settings.enable_order_emails && order.customer_email.present?
      begin
        rows = Refund.where(id: refund.id, email_sent: false)
                     .update_all(email_sent: true)
        if rows > 0
          result = EmailService.send_refund_notification(order, refund.amount_cents, refund.reason)
          unless result.is_a?(Hash) && result[:success]
            refund.update_column(:email_sent, false)
            errors << "Email: #{result&.dig(:error) || 'unknown error'}"
          end
        end
      rescue StandardError => e
        refund.update_column(:email_sent, false)
        errors << "Email: #{e.message}"
        Rails.logger.error "❌ Refund email failed for order ##{order.order_number}: #{e.message}"
      end
    end

    # --- SMS channel (atomic per-refund idempotency) ---
    if settings.enable_order_sms && order.customer_phone.present?
      begin
        sms_rows = Refund.where(id: refund.id, sms_sent: false)
                         .update_all(sms_sent: true)
        if sms_rows > 0
          sms_result = SmsService.send_refund_notification(order, refund.amount_cents)
          unless sms_result.is_a?(Hash) && sms_result[:success]
            refund.update_column(:sms_sent, false)
            errors << "SMS: #{sms_result&.dig(:error) || 'unknown error'}" unless sms_result&.dig(:skipped)
          end
        end
      rescue StandardError => e
        refund.update_column(:sms_sent, false)
        errors << "SMS: #{e.message}"
        Rails.logger.error "❌ Refund SMS failed for order ##{order.order_number}: #{e.message}"
      end
    end

    raise "Refund notification failed: #{errors.join('; ')}" if errors.any?
  end
end
