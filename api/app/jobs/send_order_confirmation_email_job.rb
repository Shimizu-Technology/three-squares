class SendOrderConfirmationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Idempotency guard: prevent duplicate confirmation emails.
    # Both the checkout controller and Stripe webhook can enqueue this job
    # if the webhook arrives before checkout finishes saving. The flag
    # ensures only the first execution sends the email.
    return if order.confirmation_email_sent?

    result = EmailService.send_order_confirmation(order)

    if result[:success]
      order.update_column(:confirmation_email_sent, true)
      Rails.logger.info "✅ Order confirmation email sent for Order ##{order.id}"
    else
      Rails.logger.error "❌ Failed to send confirmation email for Order ##{order.id}: #{result[:error]}"
      raise "Email send failed: #{result[:error]}" # Trigger retry
    end
  end
end
