# frozen_string_literal: true

module Payments
  class DeliverNotification
    class Retryable < StandardError; end
    LEASE = 5.minutes

    def self.call(record:, channel:, job:, args:, flag: nil, seq: nil)
      order = record.is_a?(Order) ? record : record.order
      raise BindingError, 'Simulated orders cannot send notifications' if order.simulated? || order.payment_environment == 'simulated'
      key = "notification:#{record.class.name}:#{record.id}:#{channel}"
      key += ":#{seq}" if seq
      row = PaymentOutbox.record!(effect_key: key, kind: 'notification', payload: { 'job' => job, 'args' => args })
      token = SecureRandom.uuid
      claimed = record.with_lock do
        row.lock!
        next false if row.state == 'delivered' && flag.nil?
        if flag && (seq ? record.public_send(flag) >= seq : record.public_send(flag))
          row.update!(state: 'delivered', delivered_at: Time.current)
          next false
        end
        # Serialize all sequences on the same record/channel, without holding a
        # DB lock over delivery. Expired claims remain recoverable after restart.
        siblings = PaymentOutbox.where("effect_key LIKE ?", "notification:#{record.class.name}:#{record.id}:#{channel}%")
        raise Retryable, 'Notification delivery already leased' if siblings.where('lease_until > ?', Time.current).exists?
        row.update!(state: 'dispatching', delivered_at: nil, lease_token: token, lease_until: LEASE.from_now, retry_count: row.retry_count + 1)
        true
      end
      return unless claimed
      result = yield
      if result.is_a?(Hash) && result[:skipped]
        PaymentOutbox.where(id: row.id, lease_token: token).update_all(state: 'skipped', lease_token: nil, lease_until: nil, last_error: result[:reason])
        return result
      end
      unless result.is_a?(Hash) && result[:success]
        raise Retryable, "Notification not delivered: #{result&.dig(:reason) || result&.dig(:error) || 'unknown'}"
      end
      record.with_lock do
        row.lock!
        raise Retryable, 'Delivery lease changed' unless row.lease_token == token
        record.update!(flag => (seq ? [record.public_send(flag), seq].max : true)) if flag
        row.update!(state: 'delivered', delivered_at: Time.current, lease_token: nil, lease_until: nil, last_error: nil)
      end
      result
    rescue StandardError => error
      if claimed
        PaymentOutbox.where(id: row.id, lease_token: token).update_all(state: 'pending', lease_token: nil, lease_until: nil,
          next_attempt_at: 1.minute.from_now, last_error: error.class.name)
      end
      raise
    end
  end
end
