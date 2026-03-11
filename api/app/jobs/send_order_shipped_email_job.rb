# frozen_string_literal: true

class SendOrderShippedEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency via last_email_event
    rows = Order.where(id: order.id)
                .where.not(last_email_event: "shipped")
                .update_all(last_email_event: "shipped")
    return if rows == 0

    begin
      result = EmailService.send_order_shipped_email(order)
      unless result.is_a?(Hash) && result[:success]
        order.update_column(:last_email_event, nil)
        raise "Shipped email failed for order ##{order_id}: #{result&.dig(:error) || 'unknown error'}"
      end
      Rails.logger.info "✅ Sent shipped email for order #{order.order_number}"
    rescue StandardError => e
      order.update_column(:last_email_event, nil)
      raise
    end
  end
end
