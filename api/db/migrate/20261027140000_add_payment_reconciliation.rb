class AddPaymentReconciliation < ActiveRecord::Migration[8.1]
  def change
    create_table :reconciliation_imports, id: :uuid do |t|
      identity_columns(t)
      t.references :user, null: false, foreign_key: true
      t.string :operation_key, null: false
      t.string :payload_digest, null: false
      t.string :request_digest
      t.string :schema_version, null: false
      t.string :source, null: false
      t.string :state, null: false, default: 'processing'
      t.jsonb :summary, null: false, default: {}
      t.jsonb :source_parameters, null: false, default: {}
      t.datetime :processed_at
      t.timestamps
    end
    add_index :reconciliation_imports, [ :payment_identity_id, :operation_key ], unique: true, name: 'unique_reconciliation_import_key'
    add_check_constraint :reconciliation_imports, "state IN ('processing','succeeded','conflicted') AND source IN ('canonical_csv','simulator')", name: 'valid_reconciliation_import'

    create_table :settlement_batches, id: :uuid do |t|
      identity_columns(t)
      t.references :reconciliation_import, type: :uuid, null: false, foreign_key: true
      t.string :external_id, null: false
      t.string :facts_digest, null: false
      t.jsonb :source_facts, null: false, default: {}
      t.string :terminal_id
      t.references :location, foreign_key: true
      t.date :business_date, null: false
      t.date :provider_batch_date, null: false
      t.datetime :closed_at
      t.bigint :sales_cents, null: false
      t.bigint :returns_cents, null: false
      t.bigint :fees_cents, null: false
      t.bigint :adjustments_cents, null: false
      t.bigint :amount_cents, null: false
      t.timestamps
    end
    add_index :settlement_batches, [ :payment_identity_id, :external_id ], unique: true, name: 'unique_identity_settlement_batch'
    add_check_constraint :settlement_batches, 'sales_cents >= 0 AND returns_cents >= 0 AND fees_cents >= 0 AND amount_cents = sales_cents - returns_cents - fees_cents + adjustments_cents', name: 'settlement_batch_exact_net'

    create_table :settlement_items, id: :uuid do |t|
      identity_columns(t)
      t.references :settlement_batch, type: :uuid, null: false, foreign_key: true
      t.references :reconciliation_import, type: :uuid, null: false, foreign_key: true
      t.references :payment_transaction, type: :uuid, foreign_key: true
      t.references :legacy_capture_binding, type: :uuid, foreign_key: true
      t.references :refund_operation, type: :uuid, foreign_key: true
      t.references :location, foreign_key: true
      t.string :external_id, null: false
      t.string :facts_digest, null: false
      t.jsonb :source_facts, null: false, default: {}
      t.string :transaction_id
      t.string :original_reference
      t.string :terminal_id
      t.string :entry_type, null: false
      t.bigint :amount_cents, null: false
      t.datetime :occurred_at, null: false
      t.string :provider_local_time
      t.string :provider_offset
      t.date :business_date, null: false
      t.timestamps
    end
    add_index :settlement_items, [ :payment_identity_id, :external_id ], unique: true, name: 'unique_identity_settlement_item'
    add_check_constraint :settlement_items, "entry_type IN ('sale','return','void','reversal','fee','adjustment') AND (entry_type = 'adjustment' OR amount_cents >= 0)", name: 'valid_settlement_item'

    create_table :funding_deposits, id: :uuid do |t|
      identity_columns(t)
      t.references :reconciliation_import, type: :uuid, null: false, foreign_key: true
      t.string :external_id, null: false
      t.string :facts_digest, null: false
      t.jsonb :source_facts, null: false, default: {}
      t.date :deposit_date, null: false
      t.bigint :amount_cents, null: false
      t.timestamps
    end
    add_index :funding_deposits, [ :payment_identity_id, :external_id ], unique: true, name: 'unique_identity_funding_deposit'

    create_table :funding_allocations, id: :uuid do |t|
      identity_columns(t)
      t.references :settlement_batch, type: :uuid, null: false, foreign_key: true
      t.references :funding_deposit, type: :uuid, null: false, foreign_key: true
      t.references :reconciliation_import, type: :uuid, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :external_id, null: false
      t.string :facts_digest, null: false
      t.jsonb :source_facts, null: false, default: {}
      t.string :reason, null: false
      t.bigint :amount_cents, null: false
      t.timestamps
    end
    add_index :funding_allocations, [ :payment_identity_id, :external_id ], unique: true, name: 'unique_identity_funding_allocation'
    add_check_constraint :funding_allocations, "amount_cents <> 0 AND length(reason) BETWEEN 1 AND 240", name: 'valid_funding_allocation'

    create_table :reconciliation_exceptions, id: :uuid do |t|
      identity_columns(t)
      t.references :reconciliation_import, type: :uuid, foreign_key: true
      t.references :settlement_batch, type: :uuid, foreign_key: true
      t.references :funding_deposit, type: :uuid, foreign_key: true
      t.string :fingerprint, null: false
      t.string :category, null: false
      t.jsonb :facts, null: false, default: {}
      t.string :state, null: false, default: 'open'
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.string :review_reason
      t.datetime :reviewed_at
      t.timestamps
    end
    add_index :reconciliation_exceptions, [ :payment_identity_id, :fingerprint ], unique: true, name: 'unique_reconciliation_exception'
    add_check_constraint :reconciliation_exceptions, "state IN ('open','reviewed') AND (state = 'open' OR (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(review_reason) BETWEEN 1 AND 240))", name: 'valid_reconciliation_review'

    create_table :reconciliation_audits, id: :uuid do |t|
      identity_columns(t)
      t.references :user, null: false, foreign_key: true
      t.string :event, null: false
      t.string :subject_type, null: false
      t.uuid :subject_id, null: false
      t.string :reason, null: false
      t.jsonb :facts, null: false, default: {}
      t.timestamps
    end
    add_check_constraint :reconciliation_audits, 'length(reason) BETWEEN 1 AND 240', name: 'reconciliation_audit_reason'

    create_table :reconciliation_timelines, id: :uuid do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true, index: { unique: true }
      t.datetime :now, null: false
      t.integer :sequence, null: false, default: 0
      t.timestamps
    end
    add_check_constraint :reconciliation_timelines, 'sequence >= 0', name: 'valid_reconciliation_sequence'
  end

  private

  def identity_columns(table)
    table.references :payment_identity, type: :uuid, null: false, foreign_key: true
    table.string :provider, null: false
    table.string :environment, null: false
    table.string :external_account_id, null: false
    table.string :currency, null: false
  end
end
