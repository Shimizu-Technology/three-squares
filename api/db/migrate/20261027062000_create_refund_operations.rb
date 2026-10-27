# frozen_string_literal: true

class CreateRefundOperations < ActiveRecord::Migration[8.1]
  def up
    create_table :refund_operations, id: :uuid do |t|
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
      t.datetime :dispatched_at, :succeeded_at
      t.timestamps
    end
    add_index :refund_operations, [ :order_id, :caller_idempotency_key ], unique: true, name: "unique_refund_request"
    add_index :refund_operations, :operation_key, unique: true
    add_index :refund_operations, [ :payment_identity_id, :raw_provider_id ], unique: true, name: "unique_identity_refund"
    add_check_constraint :refund_operations, "amount_cents > 0 AND captured_cents >= amount_cents", name: "refund_positive_bounded_amount"
    add_check_constraint :refund_operations, "kind IN ('return', 'void', 'reversal') AND state IN ('reserved', 'dispatching', 'pending', 'unknown', 'succeeded', 'failed')", name: "refund_valid_state_kind"
    add_check_constraint :refund_operations, "currency = 'USD' AND environment IN ('simulated', 'sandbox', 'production') AND ((provider = 'cash' AND payment_identity_id IS NULL AND payment_attempt_id IS NULL AND original_charge_id IS NULL) OR (provider IN ('stripe', 'worldpay') AND payment_identity_id IS NOT NULL))", name: "refund_identity_authority"
    add_reference :refunds, :refund_operation, type: :uuid, foreign_key: true, index: { unique: true }
    # Stripe IDs are unique within their immutable account identity, not globally.
    remove_index :refunds, :stripe_refund_id, if_exists: true
    add_index :refunds, :stripe_refund_id

    create_table :refund_observations do |t|
      t.references :refund_operation, type: :uuid, null: false, foreign_key: true
      t.string :event_key, :payload_digest, :observed_state, null: false
      t.timestamps
    end
    add_index :refund_observations, [ :refund_operation_id, :event_key ], unique: true, name: "unique_refund_observation"
    create_table :refund_effects do |t|
      t.references :refund_operation, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.jsonb :payload, null: false, default: {}
      t.datetime :delivered_at
      t.timestamps
    end
    add_index :refund_effects, [ :refund_operation_id, :kind ], unique: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Refund operation and event evidence must be preserved"
  end
end
