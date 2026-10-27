# frozen_string_literal: true

module Payments
  module CartCleanup
    def self.call(session:)
      return unless session.state == 'fulfilled' && InventoryCommitment.exists?(order_id: session.order_id)
      Array(session.snapshot['cart_items']).each do |saved|
        # Exact timestamp AND quantity guard: later edits/additions are preserved.
        # IDs in the immutable server snapshot are the purchase authority.
        CartItem.where(id: saved.fetch('id'), quantity: saved.fetch('quantity'), updated_at: Time.iso8601(saved.fetch('updated_at'))).delete_all
      end
    end
  end
end
