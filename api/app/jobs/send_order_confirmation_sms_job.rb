# frozen_string_literal: true

# Dedicated job for the initial "order placed" SMS — uses its own boolean
# flag (confirmation_sms_sent) instead of the seq system. This avoids
# the race where a fast admin status change (seq=2) discards the placed
# SMS (seq=1) before it runs.
class SendOrderConfirmationSmsJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency — same pattern as SendOrderConfirmationEmailJob
    rows = Order.where(id: order.id, confirmation_sms_sent: false)
                .update_all(confirmation_sms_sent: true)
    return if rows == 0

    begin
      result = SmsService.send_order_confirmation(order)

      unless result.is_a?(Hash) && result[:success]
        # Roll back on ANY non-success (including skips). If SMS was
        # temporarily disabled, the flag should not stay permanently set —
        # the admin Notify button or a re-enable + manual resend should work.
        Order.where(id: order.id, confirmation_sms_sent: true)
             .update_all(confirmation_sms_sent: false)
      end
    rescue StandardError => e
      Order.where(id: order.id, confirmation_sms_sent: true)
           .update_all(confirmation_sms_sent: false)
      raise
    end
  end
end
