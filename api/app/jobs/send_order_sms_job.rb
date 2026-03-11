# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id, event)
    order = Order.find(order_id)

    # Atomic idempotency: only send if this SMS event hasn't been sent yet.
    rows = Order.where(id: order.id)
                .where.not(last_sms_event: event)
                .update_all(last_sms_event: event)
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

      # SmsService raises SmsError on non-2xx. Skipped results (disabled/no phone)
      # return { skipped: true } — not a failure, just a no-op.
      Rails.logger.info "✅ SMS job complete for order ##{order_id} (#{event}): #{result&.dig(:success) ? 'sent' : 'skipped'}"
    rescue StandardError => e
      # Roll back so retry can re-attempt
      order.update_column(:last_sms_event, nil)
      raise
    end
  end
end
