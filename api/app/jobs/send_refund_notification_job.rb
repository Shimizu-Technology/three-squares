# frozen_string_literal: true

class SendRefundNotificationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id, refund_amount_cents, reason = nil)
    order = Order.find(order_id)
    settings = SiteSetting.instance

    if settings.enable_order_emails && order.customer_email.present?
      result = EmailService.send_refund_notification(order, refund_amount_cents, reason)
      unless result.is_a?(Hash) && result[:success]
        Rails.logger.error "❌ Refund email failed for order ##{order.order_number}: #{result&.dig(:error)}"
      end
    end

    if settings.enable_order_sms && order.customer_phone.present?
      SmsService.send_refund_notification(order, refund_amount_cents)
    end
  end
end
