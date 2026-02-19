# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String] one of: "placed", "confirmed", "ready"
  def perform(order_id, event)
    order = Order.find(order_id)

    case event
    when "placed"
      SmsService.send_order_confirmation(order)
    when "confirmed"
      SmsService.send_order_confirmed(order)
    when "ready"
      SmsService.send_order_ready(order)
    else
      Rails.logger.warn "[SendOrderSmsJob] Unknown event: #{event}"
    end
  end
end
