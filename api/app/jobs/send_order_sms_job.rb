# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String] one of: "placed", "confirmed", "ready", "processing",
  #   "shipped", "picked_up", "delivered", "cancelled"
  def perform(order_id, event)
    order = Order.find(order_id)

    result = case event
    when "placed"
      SmsService.send_order_confirmation(order)
    when "confirmed"
      SmsService.send_order_confirmed(order)
    when "ready"
      SmsService.send_order_ready(order)
    when "processing"
      SmsService.send_order_processing(order)
    when "shipped"
      SmsService.send_order_shipped(order)
    when "picked_up"
      SmsService.send_order_picked_up(order)
    when "delivered"
      SmsService.send_order_delivered(order)
    when "cancelled"
      SmsService.send_order_cancelled(order)
    else
      Rails.logger.warn "[SendOrderSmsJob] Unknown event: #{event}"
      return
    end

    # SmsService now raises SmsError on non-2xx (caught by retry_on above).
    # Skipped results (no phone, SMS disabled) return { skipped: true } — no action needed.
    Rails.logger.info "✅ SMS job complete for order ##{order_id} (#{event}): #{result&.dig(:success) ? 'sent' : 'skipped'}"
  end
end
