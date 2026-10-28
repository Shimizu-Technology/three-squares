# frozen_string_literal: true

module Payments
  class ReserveInventory
    class Unavailable < StandardError; end

    def self.call(order:, expires_at:)
      raise ArgumentError, 'Reservation must expire in the future' unless expires_at.future?
      Order.transaction do
        order = Order.lock.find(order.id)
        raise Unavailable, 'Inventory already committed' if InventoryCommitment.exists?(order_id: order.id)
        pools = locked_pools(order)
        reserve!(order, pools, expires_at)
      end
    end

    # All callers lock products by ID before variants by ID, then reservation rows.
    # Product locks serialize shared product pools even across different variants.
    def self.locked_pools(order)
      items = order.order_items.order(:id).lock.to_a
      variant_ids = items.filter_map(&:product_variant_id).uniq.sort
      product_ids = (items.filter_map(&:product_id) + ProductVariant.where(id: variant_ids).pluck(:product_id)).uniq.sort
      products = Product.where(id: product_ids).order(:id).lock.index_by(&:id)
      variants = ProductVariant.where(id: variant_ids).order(:id).lock.index_by(&:id)
      pools = {}
      items.each do |item|
        product = products[item.product_id]
        variant = variants[item.product_variant_id]
        product ||= products[variant&.product_id]
        next unless product # Retained menu/custom lines have no stock pool.
        if variant && variant.product_id != product.id
          raise Unavailable, 'Variant/product mismatch'
        end
        # Membership writes use the same product lock. Recheck here even for
        # untracked stock so reservation and final commit cannot sell a removed item.
        if order.fulfillment_type == 'pickup' && !product.offered_for_location?(order.location_id)
          raise Unavailable, 'Product is not offered at this location'
        end
        pool = case product.inventory_level
        when 'none' then next
        when 'product' then product
        when 'variant' then variant || (raise Unavailable, 'Missing inventory variant')
        else raise Unavailable, 'Unknown inventory level'
        end
        raise Unavailable, 'Invalid quantity' unless item.quantity.is_a?(Integer) && item.quantity.positive?
        key = [pool.class.name, pool.id]
        pools[key] ||= [pool, 0, {}]
        pools[key][1] += item.quantity
        pools[key][2][item.id.to_s] = item.quantity
      end
      pools
    end

    def self.reserve!(order, pools, expires_at)
      rows = InventoryReservation.where(order_id: order.id).order(:id).lock.to_a
      expected = pools.transform_values { |value| value[1] }
      existing = rows.reject { |r| r.state == 'released' }.to_h { |r| [[r.pool_type, r.pool_id], r.quantity] }
      raise Unavailable, 'Reservation contents changed' if existing.any? && existing != expected
      pools.each do |(type, id), (pool, quantity, item_quantities)|
        others = InventoryReservation.where(pool_type: type, pool_id: id, state: 'held').where.not(order_id: order.id).where('expires_at > ?', Time.current).sum(:quantity)
        stock = type == 'Product' ? pool.product_stock_quantity : pool.stock_quantity
        raise Unavailable, 'Insufficient inventory' if stock.to_i - others < quantity
        row = rows.find { |r| r.pool_type == type && r.pool_id == id }
        row ||= InventoryReservation.new(order_id: order.id, pool_type: type, pool_id: id)
        raise Unavailable, 'Reservation item snapshot changed' if row.item_quantities.present? && row.item_quantities != item_quantities
        row.update!(quantity: quantity, item_quantities: item_quantities, state: 'held', expires_at: expires_at)
      end
      InventoryReservation.where(order_id: order.id).to_a
    end

    def self.commit!(order:, snapshot_digest:)
      existing = InventoryCommitment.find_by(order_id: order.id)
      if existing
        raise Unavailable, 'Commitment snapshot mismatch' unless existing.snapshot_digest == snapshot_digest
        return existing
      end
      pools = locked_pools(order)
      # Expired reservations are revalidated under the same pool locks.
      reserve!(order, pools, 5.minutes.from_now)
      pools.each do |(type, _), (pool, quantity)|
        column = type == 'Product' ? :product_stock_quantity : :stock_quantity
        previous = pool.public_send(column)
        pool.update!(column => previous - quantity)
        if type == 'ProductVariant'
          InventoryAudit.record_order_placed(variant: pool, quantity: quantity, order: order, previous_qty: previous)
        else
          InventoryAudit.record_product_stock_change(product: pool, previous_qty: previous, new_qty: previous - quantity,
            reason: "Order ##{order.order_number} placed", audit_type: 'order_placed', order: order)
        end
      end
      InventoryReservation.where(order_id: order.id).update_all(state: 'committed', updated_at: Time.current)
      InventoryCommitment.create!(order_id: order.id, snapshot_digest: snapshot_digest)
    end
  end
end
