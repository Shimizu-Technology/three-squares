# frozen_string_literal: true

class CreatePaymentFulfillmentCore < ActiveRecord::Migration[8.1]
  def up
    add_column :payment_attempts, :snapshot, :jsonb, null: false, default: {} unless column_exists?(:payment_attempts, :snapshot)
    add_column :orders, :payment_snapshot, :jsonb, null: false, default: {} unless column_exists?(:orders, :payment_snapshot)
    add_column :payment_attempts, :retry_count, :integer, null: false, default: 0 unless column_exists?(:payment_attempts, :retry_count)
    add_column :payment_attempts, :recovery_deadline_at, :datetime unless column_exists?(:payment_attempts, :recovery_deadline_at)
    add_column :payment_attempts, :last_error, :string unless column_exists?(:payment_attempts, :last_error)
    add_column :payment_attempts, :compensation_operation_key, :uuid unless column_exists?(:payment_attempts, :compensation_operation_key)
    add_column :payment_attempts, :compensation_lease_until, :datetime unless column_exists?(:payment_attempts, :compensation_lease_until)
    add_column :payment_attempts, :compensation_provider_id, :string unless column_exists?(:payment_attempts, :compensation_provider_id)
    add_column :payment_attempts, :compensation_status, :string unless column_exists?(:payment_attempts, :compensation_status)
    add_column :payment_attempts, :compensation_dispatched_at, :datetime unless column_exists?(:payment_attempts, :compensation_dispatched_at)
    add_column :payment_attempts, :last_queried_at, :datetime unless column_exists?(:payment_attempts, :last_queried_at)
    add_index :payment_attempts, :next_recovery_at, if_not_exists: true
    create_table :inventory_commitments, id: :uuid, if_not_exists: true do |t|
      t.references :order, null: false, foreign_key: true, index: { unique: true }
      t.string :snapshot_digest, null: false
      t.timestamps
    end
    create_table :inventory_reservations, if_not_exists: true do |t|
      t.references :order, null: false, foreign_key: true
      t.string :pool_type, null: false
      t.bigint :pool_id, null: false
      t.integer :quantity, null: false
      t.string :state, null: false, default: 'held'
      t.datetime :expires_at, null: false
      t.timestamps
    end
    add_column :inventory_reservations, :item_quantities, :jsonb, null: false, default: {} unless column_exists?(:inventory_reservations, :item_quantities)
    add_column :inventory_reservations, :restored_quantities, :jsonb, null: false, default: {} unless column_exists?(:inventory_reservations, :restored_quantities)
    add_index :inventory_reservations, [:order_id, :pool_type, :pool_id], unique: true, name: 'unique_order_inventory_pool', if_not_exists: true
    add_index :inventory_reservations, [:pool_type, :pool_id, :state, :expires_at], name: 'active_inventory_reservations', if_not_exists: true
    add_check_constraint :inventory_reservations, "quantity > 0 AND pool_type IN ('Product', 'ProductVariant') AND state IN ('held', 'committed', 'released')", name: 'valid_inventory_reservation', if_not_exists: true
    create_table :payment_outboxes, id: :uuid, if_not_exists: true do |t|
      t.string :effect_key, :kind, null: false
      t.jsonb :payload, null: false, default: {}
      t.string :state, null: false, default: 'pending'
      t.uuid :lease_token
      t.datetime :lease_until, :delivered_at
      t.datetime :next_attempt_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.integer :retry_count, null: false, default: 0
      t.string :last_error
      t.timestamps
    end
    add_index :payment_outboxes, :effect_key, unique: true, if_not_exists: true
    add_index :payment_outboxes, [:state, :next_attempt_at], if_not_exists: true
    # Backfill only durable snapshots already stored by the application.
    execute "UPDATE payment_attempts a SET snapshot = s.snapshot FROM checkout_sessions s WHERE a.checkout_session_id = s.id AND a.snapshot = '{}'::jsonb"
    execute "UPDATE orders o SET payment_snapshot = s.snapshot FROM checkout_sessions s WHERE s.order_id = o.id AND o.payment_snapshot = '{}'::jsonb"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, 'Financial recovery and fulfillment evidence must be preserved'
  end
end
