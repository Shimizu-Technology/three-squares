class CreatePaymentSimulation < ActiveRecord::Migration[8.1]
  def change
    create_table :simulated_payment_records, id: :uuid do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.references :payment_attempt, type: :uuid, foreign_key: true
      t.string :kind, null: false
      t.string :operation_key, null: false
      t.string :payload_digest, null: false
      t.string :raw_id, null: false
      t.string :original_reference
      t.string :handle_digest
      t.datetime :expires_at
      t.datetime :redeemed_at
      t.string :scenario, null: false, default: 'approve'
      t.string :state, null: false, default: 'collecting'
      t.integer :amount_cents, null: false
      t.jsonb :facts, null: false, default: {}
      t.timestamps
    end
    add_index :simulated_payment_records, [:payment_identity_id, :operation_key], unique: true, name: 'simulation_operation_identity'
    add_index :simulated_payment_records, [:payment_identity_id, :raw_id], unique: true, name: 'simulation_raw_identity'
    create_table :simulation_clocks do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true, index: { unique: true }
      t.datetime :now, null: false
      t.timestamps
    end
  end
end
