# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String]
  # @param seq [Integer] monotonic sequence — prevents duplicates AND out-of-order sends
  def perform(order_id, event, seq)
    order = Order.find(order_id)

    # Atomic guard: only send if seq > last_sms_seq
    rows = Order.where(id: order.id)
                .where("last_sms_seq < ?", seq)
                .update_all(last_sms_seq: seq)
    return if rows == 0

    begin
      result = case event
      when "placed"     then SmsService.send_order_confirmation(order)
      when "confirmed"  then SmsService.send_order_confirmed(order)
      when "ready"      then SmsService.send_order_ready(order)
      when "processing" then SmsService.send_order_processing(order)
      when "shipped"    then SmsService.send_order_shipped(order)
      when "picked_up"  then SmsService.send_order_picked_up(order)
      when "delivered"  then SmsService.send_order_delivered(order)
      when "cancelled"  then SmsService.send_order_cancelled(order)
      else
        Rails.logger.warn "[SendOrderSmsJob] Unknown event: #{event}"
        return
      end

      if result.is_a?(Hash) && result[:success]
        Rails.logger.info "✅ SMS sent for order ##{order_id} (#{event})"
      else
        # Roll back so retry/resend can re-attempt
        order.update_column(:last_sms_seq, seq - 1)
        Rails.logger.info "↩️ SMS skipped for order ##{order_id} (#{event}) — seq rolled back"
      end
    rescue StandardError => e
      order.update_column(:last_sms_seq, seq - 1)
      raise
    end
  end
end
