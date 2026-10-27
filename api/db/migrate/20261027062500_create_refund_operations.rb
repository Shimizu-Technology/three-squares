# frozen_string_literal: true

class CreateRefundOperations < ActiveRecord::Migration[8.1]
  def up
    create_table :legacy_capture_bindings, id: :uuid, if_not_exists: true do |t|
      t.references :order, null: false, foreign_key: true
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.string :provider, :environment, :external_account_id, :consumption_reference, :original_reference, :currency, null: false
      t.integer :amount_cents, null: false
      t.datetime :verified_at, null: false
      t.timestamps
    end
    add_index :legacy_capture_bindings, [:provider, :environment, :external_account_id, :consumption_reference], unique: true, name: 'unique_legacy_capture_owner', if_not_exists: true
    add_check_constraint :legacy_capture_bindings, "amount_cents > 0 AND currency = 'USD'", name: 'legacy_capture_positive_usd' unless check_constraint_exists?(:legacy_capture_bindings, name: 'legacy_capture_positive_usd')
    create_table :refund_operations, id: :uuid, if_not_exists: true do |t|
      t.references :order, null: false, foreign_key: true
      t.references :payment_identity, type: :uuid, foreign_key: true
      t.references :payment_attempt, type: :uuid, foreign_key: true
      t.references :original_charge, type: :uuid, foreign_key: { to_table: :payment_transactions }
      t.references :user, foreign_key: true
      t.uuid :operation_key, null: false, default: -> { "gen_random_uuid()" }
      t.bigint :reference_number, null: false
      t.string :caller_idempotency_key, :payload_digest, :original_reference, null: false
      t.string :provider, :environment, :currency, null: false
      t.string :kind, null: false, default: "return"
      t.string :state, null: false, default: "reserved"
      t.integer :amount_cents, :captured_cents, null: false
      t.string :raw_provider_id, :reason
      t.jsonb :metadata, :restoration_request, null: false, default: {}
      t.datetime :dispatched_at, :succeeded_at, :next_recovery_at, :last_queried_at, :recovery_deadline_at
      t.integer :retry_count, null: false, default: 0
      t.string :last_error
      t.timestamps
    end
    add_index :refund_operations, [ :order_id, :caller_idempotency_key ], unique: true, name: "unique_refund_request", if_not_exists: true
    add_index :refund_operations, :operation_key, unique: true, if_not_exists: true
    add_index :refund_operations, [ :payment_identity_id, :raw_provider_id ], unique: true, name: "unique_identity_refund", if_not_exists: true
    add_check_constraint :refund_operations, "amount_cents > 0 AND captured_cents >= amount_cents", name: "refund_positive_bounded_amount" unless check_constraint_exists?(:refund_operations, name: "refund_positive_bounded_amount")
    add_check_constraint :refund_operations, "kind IN ('return', 'void', 'reversal') AND state IN ('reserved', 'dispatching', 'pending', 'unknown', 'succeeded', 'failed')", name: "refund_valid_state_kind" unless check_constraint_exists?(:refund_operations, name: "refund_valid_state_kind")
    add_check_constraint :refund_operations, "currency = 'USD' AND environment IN ('simulated', 'sandbox', 'production') AND ((provider = 'cash' AND payment_identity_id IS NULL AND payment_attempt_id IS NULL AND original_charge_id IS NULL) OR (provider IN ('stripe', 'worldpay') AND payment_identity_id IS NOT NULL))", name: "refund_identity_authority" unless check_constraint_exists?(:refund_operations, name: "refund_identity_authority")
    add_reference :refunds, :refund_operation, type: :uuid, foreign_key: true, index: { unique: true } unless column_exists?(:refunds, :refund_operation_id)
    add_index :refund_operations, [:state, :next_recovery_at], if_not_exists: true
    # Stripe IDs are unique within their immutable account identity, not globally.
    remove_index :refunds, :stripe_refund_id if index_exists?(:refunds, :stripe_refund_id, unique: true)
    add_index :refunds, :stripe_refund_id, if_not_exists: true

    create_table :refund_observations, if_not_exists: true do |t|
      t.references :refund_operation, type: :uuid, null: false, foreign_key: true
      t.string :event_key, :payload_digest, :observed_state, null: false
      t.timestamps
    end
    add_index :refund_observations, [ :refund_operation_id, :event_key ], unique: true, name: "unique_refund_observation", if_not_exists: true
    create_table :refund_effects, if_not_exists: true do |t|
      t.references :refund_operation, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.jsonb :payload, null: false, default: {}
      t.datetime :delivered_at
      t.timestamps
    end
    add_index :refund_effects, [ :refund_operation_id, :kind ], unique: true, if_not_exists: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Refund operation and event evidence must be preserved"
  end
end
