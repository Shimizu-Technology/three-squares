# frozen_string_literal: true

class SendAdminOrderSmsJob < ApplicationJob
  queue_as :default
  # Log a warning when all retries are exhausted. The block form runs
  # after the final attempt instead of re-raising — admin SMS is
  # best-effort, so we discard gracefully.
  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    Rails.logger.warn "⚠️ SendAdminOrderSmsJob exhausted retries for order ##{job.arguments.first}: #{error.message}"
  end
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    # send_admin_new_order tracks per-phone success via order.metadata
    # so retries don't re-send to phones that already received the SMS.
    SmsService.send_admin_new_order(order)
  end
end
