class SendOrderReadyEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Toggle check is handled by the controller before enqueuing.
    # Send order ready for pickup email
    EmailService.send_order_ready_email(order)

    Rails.logger.info "✅ Sent ready for pickup notification email for order #{order.order_number}"
  end
end
