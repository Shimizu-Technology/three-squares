# frozen_string_literal: true

class SendOrderConfirmationSmsJob < ApplicationJob
  queue_as :default
  SmsTemporarilyUnavailable = Payments::DeliverNotification::Retryable
  retry_on StandardError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    Payments::DeliverNotification.call(record: order, channel: 'confirmation_sms', flag: :confirmation_sms_sent,
      job: self.class.name, args: [order_id]) { SmsService.send_order_confirmation(order) }
  end
end
