# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default

  class SmsTemporarilyUnavailable < StandardError; end

  # Temporary unavailability (SMS disabled, carrier skip) — retry with backoff,
  # log warning on exhaustion instead of flooding dead job queue.
  retry_on SmsTemporarilyUnavailable, wait: :polynomially_longer, attempts: 5 do |job, error|
    Rails.logger.warn "⚠️ SendOrderSmsJob exhausted retries for order ##{job.arguments[0]} " \
                      "(#{job.arguments[1]}): #{error.message}"
  end
  retry_on StandardError, wait: :polynomially_longer, attempts: 5
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
      # NOTE: "placed" is handled by SendOrderConfirmationSmsJob (boolean flag),
      # not this seq-based job. Do not add a "placed" branch here.
      when "confirmed"  then SmsService.send_order_confirmed(order)
      when "ready"      then SmsService.send_order_ready(order)
      when "processing" then SmsService.send_order_processing(order)
      when "shipped"    then SmsService.send_order_shipped(order)
      when "picked_up"  then SmsService.send_order_picked_up(order)
      when "delivered"  then SmsService.send_order_delivered(order)
      when "cancelled"  then SmsService.send_order_cancelled(order)
      else
        # Roll back seq so unknown events don't permanently consume a slot
        Order.where(id: order.id, last_sms_seq: seq).update_all(last_sms_seq: seq - 1)
        Rails.logger.warn "[SendOrderSmsJob] Unknown event: #{event} — seq rolled back"
        return
      end

      if result.is_a?(Hash) && result[:success]
        Rails.logger.info "✅ SMS sent for order ##{order_id} (#{event})"
      else
        # Roll back seq and raise so retry_on fires — covers both skips
        # (SMS temporarily disabled) and failures. Matches the pattern
        # in SendOrderConfirmationSmsJob.
        Order.where(id: order.id, last_sms_seq: seq).update_all(last_sms_seq: seq - 1)
        raise SmsTemporarilyUnavailable, "SMS #{result&.dig(:skipped) ? 'skipped' : 'failed'} for order ##{order_id} (#{event}): #{result&.dig(:reason) || 'unknown'}"
      end
    rescue SmsTemporarilyUnavailable
      raise # Let retry_on handle it
    rescue StandardError => e
      Order.where(id: order.id, last_sms_seq: seq).update_all(last_sms_seq: seq - 1)
      raise
    end
  end
end
