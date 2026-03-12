# frozen_string_literal: true

class SendOrderConfirmationEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)

    # Atomic idempotency guard: UPDATE ... WHERE confirmation_email_sent = false
    # returns 0 rows if another job already claimed this send.
    rows = Order.where(id: order.id, confirmation_email_sent: false)
                .update_all(confirmation_email_sent: true)
    return if rows == 0

    begin
      result = EmailService.send_order_confirmation(order)

      unless result.is_a?(Hash) && result[:success]
        raise "Email send failed: #{result&.dig(:error) || 'unknown error'}"
      end

      Rails.logger.info "✅ Order confirmation email sent for Order ##{order.id}"
    rescue StandardError => e
      # Conditional rollback — only if we still own the flag
      Order.where(id: order.id, confirmation_email_sent: true)
           .update_all(confirmation_email_sent: false)
      raise
    end
  end
end
