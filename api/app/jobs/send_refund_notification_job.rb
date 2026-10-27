# frozen_string_literal: true

class SendRefundNotificationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(refund_id)
    refund = Refund.find(refund_id)
    return unless refund.succeeded?
    order = refund.order
    settings = SiteSetting.instance
    errors = []
    if order.customer_email.present?
      begin
        Payments::DeliverNotification.call(record: refund, channel: 'refund_email', flag: :email_sent,
          job: self.class.name, args: [refund_id]) do
          if settings.enable_order_emails
            EmailService.send_refund_notification(order, refund.amount_cents, refund.reason)
          else
            { success: false, skipped: true, reason: 'Customer email disabled' }
          end
        end
      rescue StandardError => error
        errors << error
      end
    end
    if order.customer_phone.present?
      begin
        Payments::DeliverNotification.call(record: refund, channel: 'refund_sms', flag: :sms_sent,
          job: self.class.name, args: [refund_id]) { SmsService.send_refund_notification(order, refund.amount_cents) }
      rescue StandardError => error
        errors << error
      end
    end
    raise errors.first if errors.any?
  end
end
