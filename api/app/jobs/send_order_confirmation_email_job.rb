# frozen_string_literal: true

class SendOrderConfirmationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    Payments::DeliverNotification.call(record: order, channel: 'confirmation_email', flag: :confirmation_email_sent,
      job: self.class.name, args: [order_id]) do
      if SiteSetting.instance.enable_order_emails && order.customer_email.present?
        EmailService.send_order_confirmation(order)
      else
        { success: false, skipped: true, reason: 'Customer email disabled or missing' }
      end
    end
  end
end
