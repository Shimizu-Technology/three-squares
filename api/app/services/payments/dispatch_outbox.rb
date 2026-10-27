# frozen_string_literal: true

module Payments
  class DispatchOutbox
    JOBS = {
      'confirmation_email' => 'SendOrderConfirmationEmailJob', 'confirmation_sms' => 'SendOrderConfirmationSmsJob',
      'admin_email' => 'SendAdminNotificationEmailJob', 'admin_sms' => 'SendAdminOrderSmsJob',
      'refund_notification' => 'SendRefundNotificationJob'
    }.freeze
    NOTIFICATION_JOBS = (JOBS.values + %w[SendOrderStatusEmailJob SendOrderSmsJob SendRefundNotificationJob]).freeze

    def self.call(outbox:)
      if outbox.kind == 'notification'
        payload = outbox.payload
        raise BindingError, 'Unknown notification consumer' unless NOTIFICATION_JOBS.include?(payload['job'])
        # Notification jobs own the delivery lease and acknowledgement themselves.
        result = payload['job'].constantize.new.perform(*payload.fetch('args'))
        # Status intents and consumer delivery rows have separate identities.
        # Acknowledge the originating intent as well as the consumer's lease.
        outbox.update!(state: result.is_a?(Hash) && result[:skipped] ? 'skipped' : 'delivered',
          delivered_at: result.is_a?(Hash) && result[:skipped] ? nil : Time.current, lease_until: nil, lease_token: nil, last_error: nil)
        return result
      end
      token = SecureRandom.uuid
      claimed = outbox.with_lock do
        next false if outbox.state == 'delivered' || outbox.lease_until&.future? || outbox.next_attempt_at.future?
        outbox.update!(state: 'dispatching', lease_token: token, lease_until: 5.minutes.from_now, retry_count: outbox.retry_count + 1)
        true
      end
      return unless claimed
      case outbox.kind
      when 'cart_cleanup' then CartCleanup.call(session: CheckoutSession.find(outbox.payload.fetch('session_id')))
      when 'admin_push'
        order = Order.find(outbox.payload.fetch('order_id'))
        raise BindingError, 'Simulated orders cannot send notifications' if order.simulated? || order.payment_environment == 'simulated'
        raise DeliverNotification::Retryable, 'Push consumer unavailable' unless defined?(SendAdminPushNotificationJob)
        SendAdminPushNotificationJob.perform_later(order.id)
      when 'compensate'
        attempt = PaymentAttempt.find(outbox.payload.fetch('attempt_id'))
        CompensateAttempt.call(attempt: attempt)
        raise DeliverNotification::Retryable, 'Compensation not confirmed' unless attempt.reload.state == 'compensated'
      else
        job = JOBS.fetch(outbox.kind) { raise BindingError, 'Unknown outbox effect' }
        # Calling perform keeps delivery failures visible to the primary-DB outbox;
        # ActiveJob.perform_now may swallow them into a separate queue retry.
        result = job.constantize.new.perform(outbox.payload.fetch(outbox.kind == 'refund_notification' ? 'refund_id' : 'order_id'))
      end
      PaymentOutbox.where(id: outbox.id, lease_token: token).update_all(state: result.is_a?(Hash) && result[:skipped] ? 'skipped' : 'delivered', delivered_at: result.is_a?(Hash) && result[:skipped] ? nil : Time.current, lease_until: nil, lease_token: nil, last_error: nil)
    rescue StandardError => error
      if claimed
        PaymentOutbox.where(id: outbox.id, lease_token: token).update_all(state: 'pending', lease_until: nil, lease_token: nil,
          next_attempt_at: 1.minute.from_now, last_error: error.class.name)
      end
      raise
    end
  end
end
