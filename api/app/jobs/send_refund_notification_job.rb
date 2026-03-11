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

    # Send email notification
    if settings.enable_order_emails && order.customer_email.present?
      EmailService.send_refund_notification(order, refund_amount_cents, reason)
    end

    # Send SMS notification (SmsService handles its own toggle checks)
    SmsService.send_refund_notification(order, refund_amount_cents)
  end
end
