class SendOrderReadyEmailJob < ApplicationJob
  queue_as :default

  def perform(order_id)
    order = Order.find(order_id)

    # Toggle check is handled by the controller before enqueuing.
    # Send order ready for pickup email
    EmailService.send_order_ready_email(order)

    Rails.logger.info "✅ Sent ready for pickup notification email for order #{order.order_number}"
  rescue StandardError => e
    Rails.logger.error "❌ Failed to send ready email for order #{order_id}: #{e.message}"
    # Don't raise - we don't want email failures to break order updates
  end
end
