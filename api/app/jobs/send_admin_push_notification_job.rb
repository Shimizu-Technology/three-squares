# frozen_string_literal: true

class SendAdminPushNotificationJob < ApplicationJob
  queue_as :default

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    Rails.logger.warn "⚠️ SendAdminPushNotificationJob exhausted retries for order ##{job.arguments.first}: #{error.message}"
  end
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    AdminPushNotificationService.send_new_order(order)
  end
end
