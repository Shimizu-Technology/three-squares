# frozen_string_literal: true

class SendOrderStatusEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String] one of: "confirmed", "processing", "picked_up", "delivered", "cancelled"
  def perform(order_id, event)
    order = Order.find(order_id)

    case event
    when "confirmed"
      EmailService.send_order_confirmed_email(order)
    when "processing"
      EmailService.send_order_processing_email(order)
    when "picked_up"
      EmailService.send_order_picked_up_email(order)
    when "delivered"
      EmailService.send_order_delivered_email(order)
    when "cancelled"
      EmailService.send_order_cancelled_email(order)
    else
      Rails.logger.warn "[SendOrderStatusEmailJob] Unknown event: #{event}"
    end
  end
end
