class SendOrderReadyEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    result = EmailService.send_order_ready_email(order)

    # EmailService returns { success: bool, error: ... } — raise on failure
    # so retry_on can re-attempt delivery instead of silently dropping.
    unless result.is_a?(Hash) && result[:success]
      raise "Ready email failed for order ##{order_id}: #{result&.dig(:error) || 'unknown error'}"
    end

    Rails.logger.info "✅ Sent ready for pickup notification email for order #{order.order_number}"
  end
end
