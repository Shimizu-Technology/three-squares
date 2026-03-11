class SendOrderConfirmationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency guard: UPDATE ... WHERE confirmation_email_sent = false
    # returns 0 rows if another job already claimed this send. This eliminates
    # the race between checkout controller and Stripe webhook dual-enqueue.
    rows_updated = Order.where(id: order.id, confirmation_email_sent: false)
                        .update_all(confirmation_email_sent: true)

    return if rows_updated == 0 # Another job already sent it

    result = EmailService.send_order_confirmation(order)

    unless result[:success]
      # Roll back the flag so a retry can attempt again
      order.update_column(:confirmation_email_sent, false)
      raise "Email send failed: #{result[:error]}"
    end

    Rails.logger.info "✅ Order confirmation email sent for Order ##{order.id}"
  end
end
