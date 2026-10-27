# frozen_string_literal: true

module Payments
  # Transfer success intents atomically to the primary-DB transactional outbox.
  # RefundEffect.delivered_at acknowledges this handoff, not external transport.
  class DispatchRefundEffects
    def self.call(operation: nil, restore_now: false)
      scope = operation ? operation.refund_effects : RefundEffect.all
      scope.undelivered.order(:id).limit(200).each do |effect|
        effect.with_lock do
          next if effect.delivered_at
          refund = effect.refund_operation.refund
          kind = effect.kind
          raise BindingError, 'Unknown refund effect' unless %w[refund_notification refund_inventory].include?(kind)
          suffix = kind == 'refund_inventory' ? 'inventory' : 'notification'
          PaymentOutbox.record!(effect_key: "refund:#{refund.id}:#{suffix}", kind: kind,
            payload: kind == 'refund_inventory' ? { 'operation_id' => effect.refund_operation_id } : { 'refund_id' => refund.id })
          effect.update!(delivered_at: Time.current)
        end
      end
      if restore_now && operation
        effect = PaymentOutbox.find_by(effect_key: "refund:#{operation.refund.id}:inventory")
        DispatchOutbox.call(outbox: effect) if effect
      end
    end
  end
end
