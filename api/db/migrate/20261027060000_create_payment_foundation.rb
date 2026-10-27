# frozen_string_literal: true

class CreatePaymentFoundation < ActiveRecord::Migration[8.1]
  def up
    create_table :payment_operation_numbers, if_not_exists: true do |t|
      t.timestamps
    end
    create_table :payment_identities, id: :uuid, if_not_exists: true do |t|
      t.string :provider, :environment, :external_account_id, :profile_key, :credential_reference, null: false
      t.string :currency, null: false, default: "USD"
      t.timestamps
    end
    add_index :payment_identities, :profile_key, unique: true, if_not_exists: true
    create_table :payment_profiles, if_not_exists: true do |t|
      t.references :location, foreign_key: true
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.string :provider, :channel, :presentation, null: false
      t.boolean :enabled, null: false, default: false
      t.jsonb :capabilities, null: false, default: {}
      t.timestamps
    end
    add_index :payment_profiles, [:location_id, :channel, :provider], unique: true, where: "enabled", name: "one_enabled_payment_profile_per_location_channel", if_not_exists: true
    add_index :payment_profiles, [:channel, :provider], unique: true, where: "enabled AND location_id IS NULL", name: "one_enabled_default_payment_profile", if_not_exists: true
    create_table :checkout_sessions, id: :uuid, if_not_exists: true do |t|
      t.references :order, null: false, foreign_key: true, index: { unique: true }
      t.references :user, foreign_key: true
      t.references :location, foreign_key: true
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.string :channel, null: false, default: "online"
      t.string :guest_capability_digest, :owner_key, :caller_idempotency_key, :snapshot_digest, null: false
      t.jsonb :snapshot, null: false, default: {}
      t.integer :amount_cents, null: false
      t.string :currency, null: false, default: "USD"
      t.string :state, null: false, default: "pending"
      t.datetime :expires_at, null: false
      t.datetime :consumed_at
      t.timestamps
    end
    add_index :checkout_sessions, [:owner_key, :caller_idempotency_key], unique: true, name: "unique_checkout_request", if_not_exists: true
    create_table :payment_attempts, id: :uuid, if_not_exists: true do |t|
      t.references :checkout_session, type: :uuid, null: false, foreign_key: true
      t.references :order, null: false, foreign_key: true
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.string :operation, null: false, default: "sale"
      t.uuid :operation_key, null: false, default: -> { "gen_random_uuid()" }
      t.bigint :reference_number, null: false
      t.string :payload_digest, null: false
      t.integer :requested_cents, null: false
      t.integer :approved_cents, :captured_cents, null: false, default: 0
      t.string :currency, null: false, default: "USD"
      t.string :state, null: false, default: "created"
      t.string :raw_provider_id, :setup_id, :hosted_url, :error_classification
      t.jsonb :collection_config, :provider_metadata, null: false, default: {}
      t.datetime :next_recovery_at, :dispatched_at, :compensation_claimed_at
      t.integer :recovery_count, null: false, default: 0
      t.timestamps
    end
    add_index :payment_attempts, [:payment_identity_id, :operation_key], unique: true, if_not_exists: true
    add_index :payment_attempts, [:payment_identity_id, :raw_provider_id], unique: true, if_not_exists: true
    add_index :payment_attempts, :checkout_session_id, unique: true, where: "operation = 'sale' AND state NOT IN ('failed', 'cancelled', 'compensated')", name: "one_active_collection_per_session", if_not_exists: true
    create_table :payment_transactions, id: :uuid, if_not_exists: true do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.references :payment_attempt, type: :uuid, null: false, foreign_key: true
      t.references :order, foreign_key: true
      t.string :provider, :raw_provider_id, :reference, :currency, null: false
      t.integer :amount_cents, null: false
      t.string :state, null: false
      t.string :settlement_state, null: false, default: "unknown"
      t.jsonb :metadata, null: false, default: {}
      t.datetime :first_observed_at, :last_observed_at, null: false
      t.timestamps
    end
    add_index :payment_transactions, [:provider, :reference], unique: true, if_not_exists: true
    add_index :payment_transactions, [:payment_identity_id, :raw_provider_id], unique: true, name: "unique_identity_transaction", if_not_exists: true
    add_index :payment_transactions, :order_id, unique: true, where: "order_id IS NOT NULL", name: "one_consumed_charge_per_order", if_not_exists: true
    {
      payment_identity_id: :uuid, payment_attempt_id: :uuid, checkout_session_id: :uuid,
      payment_provider: :string, payment_reference: :string, payment_session_id: :string,
      payment_environment: :string, inventory_committed_at: :datetime, inventory_commitment_id: :uuid,
      guest_access_digest: :string, guest_access_expires_at: :datetime
    }.each { |name, type| add_column :orders, name, type unless column_exists?(:orders, name) }
    add_column :orders, :simulated, :boolean, null: false, default: false unless column_exists?(:orders, :simulated)
    add_column :orders, :payment_metadata, :jsonb, null: false, default: {} unless column_exists?(:orders, :payment_metadata)
    [:payment_identity, :payment_attempt, :checkout_session].each do |target|
      add_foreign_key :orders, target.to_s.pluralize unless foreign_key_exists?(:orders, target.to_s.pluralize)
    end
    add_index :orders, :checkout_session_id, unique: true, if_not_exists: true
    add_index :orders, :inventory_commitment_id, unique: true, if_not_exists: true
    add_check_constraint :checkout_sessions, "amount_cents > 0", name: "checkout_positive_amount", if_not_exists: true
    add_check_constraint :payment_attempts, "requested_cents > 0 AND approved_cents >= 0 AND captured_cents >= 0 AND captured_cents <= approved_cents AND approved_cents <= requested_cents", name: "payment_attempt_amount_bounds", if_not_exists: true
    add_check_constraint :payment_transactions, "amount_cents > 0", name: "transaction_positive_amount", if_not_exists: true
    add_check_constraint :payment_identities, "provider IN ('stripe', 'worldpay') AND environment IN ('simulated', 'sandbox', 'production') AND currency = 'USD'", name: "valid_payment_identity", if_not_exists: true
    add_check_constraint :checkout_sessions, "(user_id IS NULL AND guest_capability_digest <> '') OR (user_id IS NOT NULL AND guest_capability_digest = '')", name: "checkout_owner_authority", if_not_exists: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Financial ledger records must be preserved"
  end
end
