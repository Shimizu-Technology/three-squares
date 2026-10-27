# frozen_string_literal: true

module Payments
  module Snapshot
    def self.canonical(value)
      case value
      when Hash then value.stringify_keys.sort.to_h.transform_values { |v| canonical(v) }
      when Array then value.map { |v| canonical(v) }
      else value.as_json
      end
    end

    def self.digest(snapshot)
      Digest::SHA256.hexdigest(JSON.generate(canonical(snapshot)))
    end

    # Call inside the transaction that creates the pending order/session/attempt.
    def self.persist!(session:, attempt:, order:)
      raise BindingError, 'Invalid snapshot digest' unless digest(session.snapshot) == session.snapshot_digest
      attempt.update!(snapshot: session.snapshot)
      order.update!(payment_snapshot: session.snapshot)
    end

    def self.validate!(session:, attempt:, order:, current: true)
      snapshot = session.snapshot
      unless snapshot.is_a?(Hash) && snapshot['order'].is_a?(Hash) && snapshot['items'].is_a?(Array) &&
          digest(snapshot) == session.snapshot_digest && attempt.payload_digest == session.snapshot_digest
        raise BindingError, 'Invalid durable payment snapshot'
      end
      [attempt.snapshot, order.payment_snapshot].each do |copy|
        raise BindingError, 'Payment snapshot changed' unless copy == snapshot
      end
      return unless current
      matches = ->(attrs, record) { attrs.all? { |key, value| record.has_attribute?(key) && canonical(record.attributes[key]) == canonical(value) } }
      raise BindingError, 'Order changed after collection' unless matches.call(snapshot['order'], order)
      items = order.order_items.order(:id).lock.to_a
      saved = snapshot['items'].sort_by { |attrs| attrs.fetch('id').to_i }
      unless saved.size == items.size && saved.zip(items).all? { |attrs, item| matches.call(attrs, item) }
        raise BindingError, 'Order items changed after collection'
      end
    end
  end
end
