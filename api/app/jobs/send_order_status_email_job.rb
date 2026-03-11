# frozen_string_literal: true

class SendOrderStatusEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  # @param order_id [Integer]
  # @param event [String] e.g. "confirmed", "processing", "ready", "shipped", etc.
  # @param seq [Integer] monotonic sequence — prevents duplicates AND out-of-order sends
  def perform(order_id, event, seq)
    order = Order.find(order_id)

    # Atomic guard: only send if seq > last_email_seq.
    # A stale "confirmed" job (seq=1) arriving after "ready" (seq=3) is discarded.
    rows = Order.where(id: order.id)
                .where("last_email_seq < ?", seq)
                .update_all(last_email_seq: seq)
    if rows == 0
      Rails.logger.info "⏭️ SendOrderStatusEmailJob skipped for order ##{order_id} (#{event}, seq=#{seq}) — higher seq already processed (possible force-resend race)"
      return
    end

    begin
      result = case event
      when "confirmed"  then EmailService.send_order_confirmed_email(order)
      when "processing" then EmailService.send_order_processing_email(order)
      when "ready"      then EmailService.send_order_ready_email(order)
      when "shipped"    then EmailService.send_order_shipped_email(order)
      when "picked_up"  then EmailService.send_order_picked_up_email(order)
      when "delivered"  then EmailService.send_order_delivered_email(order)
      when "cancelled"  then EmailService.send_order_cancelled_email(order)
      else
        # Roll back seq so unknown events don't permanently consume a slot
        Order.where(id: order.id, last_email_seq: seq).update_all(last_email_seq: seq - 1)
        Rails.logger.warn "[SendOrderStatusEmailJob] Unknown event: #{event} — seq rolled back"
        return
      end

      # Raise on failure — rescue block handles the rollback
      unless result.is_a?(Hash) && result[:success]
        raise "Email failed for order ##{order_id} (#{event}): #{result&.dig(:error) || 'unknown'}"
      end
    rescue StandardError => e
      # Single rollback point — conditional to avoid overwriting a higher-seq job
      Order.where(id: order.id, last_email_seq: seq).update_all(last_email_seq: seq - 1)
      raise
    end
  end
end
