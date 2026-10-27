# frozen_string_literal: true

module Payments
  module ReceiptFacts
    TEXT_FIELDS = %w[card_logo entry_mode approval_number payment_type account_type network_label processor_time].freeze
    EMV_TAGS = %w[95 9B 9F06 9F27 9F36].freeze

    def self.project(value)
      return {} unless value.is_a?(Hash)
      facts = value.stringify_keys
      result = facts.slice(*TEXT_FIELDS).select { |_, text| text.is_a?(String) && text.bytesize.between?(1, 128) && !text.match?(/[[:cntrl:]]|(?:[0-9][ -]?){12,}|[%^;=]/) }
      result['last4'] = facts['last4'] if facts['last4'].is_a?(String) && facts['last4'].match?(/\A[0-9]{4}\z/)
      emv = facts['emv']
      if emv.is_a?(Hash)
        safe = emv.stringify_keys.slice(*EMV_TAGS).select { |_, text| text.is_a?(String) && text.match?(/\A[0-9A-Fa-f]{2,32}\z/) }
        result['emv'] = safe if safe.any?
      end
      result
    end

    def self.for_order(order)
      return unless order.payment_attempt_id
      charge = PaymentTransaction.find_by(payment_attempt_id: order.payment_attempt_id)
      return unless charge && charge.payment_attempt.order_id == order.id
      facts = project(charge.metadata['receipt'])
      terminal = charge.payment_attempt.snapshot.dig('collection', 'terminal')
      facts.merge('provider' => charge.provider, 'environment' => charge.payment_identity.environment,
        'transaction_id' => charge.raw_provider_id, 'state' => charge.state, 'amount_cents' => charge.amount_cents,
        'refunded_cents' => order.total_refunded_cents, 'observed_at' => charge.first_observed_at.iso8601,
        'lane_id' => terminal&.fetch('lane_id'), 'terminal_id' => terminal&.fetch('terminal_id'))
    end
  end
end
