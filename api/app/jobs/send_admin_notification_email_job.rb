# frozen_string_literal: true

class SendAdminNotificationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound do |job, _error|
    Rails.logger.error("Order ##{job.arguments.first} not found - cannot send admin notification")
  end

  def perform(order_id)
    order = Order.find(order_id)
    Payments::DeliverNotification.call(record: order, channel: 'admin_email', job: self.class.name,
      args: [order_id]) { EmailService.send_admin_notification(order) }
  end
end
