# frozen_string_literal: true

class SendAdminPushNotificationJob < ApplicationJob
  class DeliveryError < StandardError; end

  queue_as :default

  retry_on DeliveryError, wait: :polynomially_longer, attempts: 3 do |job, error|
    Rails.logger.warn "⚠️ SendAdminPushNotificationJob exhausted retries for order ##{job.arguments.first}: #{error.class}"
  end
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    AdminPushNotificationService.send_new_order(order)
  rescue ActiveRecord::RecordNotFound
    raise
  rescue StandardError => error
    # Active Job logs retry errors itself. Never pass provider response bodies
    # or subscription capabilities to framework instrumentation or logs.
    raise DeliveryError, "Web push delivery failed (#{error.class})", cause: nil
  end
end
