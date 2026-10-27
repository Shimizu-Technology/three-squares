# frozen_string_literal: true

module Payments
  class RestoreRefundInventory
    def self.call(operation:)
      ReserveRefund.with_locks(operation.order_id) do |order, _, _|
        operation = RefundOperation.lock.find(operation.id)
        raise BindingError, 'Only confirmed refunds restore inventory' unless operation.state == 'succeeded'
        refund = operation.refund
        next refund.metadata['inventory_restoration'] if refund.metadata['inventory_restoration']
        request = operation.restoration_request['restock_items']
        result = if request == true || %w[true all].include?(request)
          RestoreInventory.call(order: order, user: operation.user)
        elsif request.is_a?(Array) && request.any?
          RestoreInventory.call(order: order, item_ids: request, user: operation.user)
        else
          { restored: false, status: 'not_requested' }
        end
        refund.update!(metadata: refund.metadata.merge('inventory_restoration' => result.stringify_keys))
        order.update!(metadata: order.metadata.merge('inventory_restoration' => result.stringify_keys)) unless result[:status] == 'not_requested'
        result
      end
    end
  end
end
