# frozen_string_literal: true

module Payments
  # Shares each item's restored quantity between cancellation and all refunds.
  # Pool identity comes from the committed reservation, never today's catalog mode.
  class RestoreInventory
    def self.call(order:, item_ids: nil, user: nil)
      Order.transaction do
        order = Order.lock.find(order.id)
        unless InventoryCommitment.exists?(order_id: order.id)
          foundation = order.checkout_session_id || order.payment_attempt_id || order.metadata['cash_request_key']
          return { restored: false, status: foundation && !%w[paid refunded].include?(order.payment_status) ? 'not_committed' : 'manual_review_required' }
        end
        rows = InventoryReservation.where(order_id: order.id, state: 'committed').order(:id).to_a
        return { restored: false, status: 'manual_review_required' } if rows.any? { |row| row.item_quantities.blank? }
        variant_ids = rows.select { |r| r.pool_type == 'ProductVariant' }.map(&:pool_id)
        product_ids = rows.select { |r| r.pool_type == 'Product' }.map(&:pool_id) + ProductVariant.where(id: variant_ids).pluck(:product_id)
        products = Product.where(id: product_ids.uniq).order(:id).lock.index_by(&:id)
        variants = ProductVariant.where(id: rows.select { |r| r.pool_type == 'ProductVariant' }.map(&:pool_id)).order(:id).lock.index_by(&:id)
        return { restored: false, status: 'manual_review_required' } if rows.any? { |row| (row.pool_type == 'Product' ? products[row.pool_id] : variants[row.pool_id]).nil? }
        rows = InventoryReservation.where(id: rows.map(&:id)).order(:id).lock.to_a
        selected = item_ids&.map(&:to_s)
        changed = false
        rows.each do |row|
          restored = row.restored_quantities.dup
          quantity = row.item_quantities.sum do |id, purchased|
            next 0 if selected && !selected.include?(id)
            remaining = purchased - restored.fetch(id, 0)
            raise BindingError, 'Invalid restored inventory evidence' if remaining.negative?
            restored[id] = purchased
            remaining
          end
          next if quantity.zero?
          pool = row.pool_type == 'Product' ? products[row.pool_id] : variants[row.pool_id]
          raise BindingError, 'Original stock pool is missing; manual review required' unless pool
          column = row.pool_type == 'Product' ? :product_stock_quantity : :stock_quantity
          previous = pool.public_send(column)
          pool.update!(column => previous + quantity)
          if row.pool_type == 'ProductVariant'
            InventoryAudit.record_order_cancelled(variant: pool, quantity: quantity, order: order, user: user)
          else
            InventoryAudit.record_product_stock_change(product: pool, previous_qty: previous, new_qty: previous + quantity,
              reason: "Order ##{order.order_number} stock restored", audit_type: 'order_cancelled', order: order, user: user)
          end
          row.update!(restored_quantities: restored)
          changed = true
        end
        { restored: changed, status: 'complete' }
      end
    end
  end
end
