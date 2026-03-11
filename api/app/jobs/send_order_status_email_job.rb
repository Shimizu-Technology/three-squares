# frozen_string_literal: true

class SendOrderStatusEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String] one of: "confirmed", "processing", "picked_up", "delivered", "cancelled"
  def perform(order_id, event)
    order = Order.find(order_id)

    # Atomic idempotency: only send if this event hasn't been sent yet.
    # UPDATE WHERE last_email_event != event (or IS NULL) claims the send.
    rows = Order.where(id: order.id)
                .where.not(last_email_event: event)
                .update_all(last_email_event: event)
    return if rows == 0 # Already sent for this event

    begin
      result = case event
      when "confirmed"  then EmailService.send_order_confirmed_email(order)
      when "processing" then EmailService.send_order_processing_email(order)
      when "picked_up"  then EmailService.send_order_picked_up_email(order)
      when "delivered"  then EmailService.send_order_delivered_email(order)
      when "cancelled"  then EmailService.send_order_cancelled_email(order)
      else
        Rails.logger.warn "[SendOrderStatusEmailJob] Unknown event: #{event}"
        return
      end

      unless result.is_a?(Hash) && result[:success]
        order.update_column(:last_email_event, nil)
        raise "Email delivery failed for order ##{order_id} (#{event}): #{result&.dig(:error) || 'unknown error'}"
      end
    rescue StandardError => e
      order.update_column(:last_email_event, nil)
      raise
    end
  end
end
