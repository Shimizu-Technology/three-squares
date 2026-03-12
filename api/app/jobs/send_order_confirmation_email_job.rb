class SendOrderConfirmationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency — prevents duplicate emails when enqueued from
    # both the checkout controller and the Stripe webhook handler.
    rows = Order.where(id: order.id, confirmation_email_sent: false)
                .update_all(confirmation_email_sent: true)
    if rows == 0
      Rails.logger.info "⏭️ Confirmation email already sent for Order ##{order.id} — skipping"
      return
    end

    result = EmailService.send_order_confirmation(order)

    if result[:success]
      Rails.logger.info "✅ Order confirmation email sent for Order ##{order.id}"
    else
      # Roll back flag so retry or re-enqueue can try again
      Order.where(id: order.id).update_all(confirmation_email_sent: false)
      Rails.logger.error "❌ Failed to send confirmation email for Order ##{order.id}: #{result[:error]}"
      raise "Confirmation email failed: #{result[:error]}"
    end
  rescue ActiveRecord::RecordNotFound
    raise # Let discard_on handle it
  rescue StandardError => e
    # Roll back flag on any unexpected error so retries work
    Order.where(id: order_id).update_all(confirmation_email_sent: false) rescue nil
    raise
  end
end
