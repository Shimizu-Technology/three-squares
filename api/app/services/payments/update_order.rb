# frozen_string_literal: true

module Payments
  class UpdateOrder
    def self.call(order:, attributes:, user:)
      action = lambda do |current|
        attrs = attributes.to_h.stringify_keys
        if current.status == 'cancelled' && attrs['status'].present? && attrs['status'] != 'cancelled'
          raise Conflict, 'Cancelled orders cannot be reopened'
        end
        current.update!(attrs)
        if current.saved_change_to_status?
          if current.status == 'cancelled'
            RestoreInventory.call(order: current, user: user)
            # No commitment means no deduction to restore. A late capture is
            # compensated by the finalizer, which observes this locked status.
          end
          unless current.simulated? || current.payment_environment == 'simulated'
            settings = SiteSetting.instance
            seq = current.notification_seq if Order::STATUS_SEQUENCE.key?(current.status) && current.status != 'pending'
            if seq
              { 'SendOrderStatusEmailJob' => settings.enable_order_emails && current.customer_email.present?,
                'SendOrderSmsJob' => settings.enable_order_sms && current.customer_phone.present? }.each do |job, enabled|
                next unless enabled
                PaymentOutbox.record!(effect_key: "status:#{current.id}:#{current.status}:#{current.updated_at.to_f}:#{job}",
                  kind: 'notification', payload: { 'job' => job, 'args' => [current.id, current.status, seq] })
              end
            end
          end
        end
        current
      end
      if order.payment_attempt_id
        AttemptLock.call(PaymentAttempt.find(order.payment_attempt_id)) { |_, _, _, current| action.call(current) }
      else
        Order.transaction { action.call(Order.lock.find(order.id)) }
      end
    end
  end
end
