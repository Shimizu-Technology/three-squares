class CreatePaymentTerminals < ActiveRecord::Migration[8.1]
  def change
    create_table :payment_terminals do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.string :lane_id, null: false
      t.string :terminal_id, null: false
      t.string :label, null: false
      t.string :status, null: false, default: 'ready'
      t.references :leased_attempt, type: :uuid, foreign_key: {to_table: :payment_attempts}
      t.datetime :leased_at
      t.jsonb :configuration, null: false, default: {}
      t.datetime :retired_at
      t.timestamps
    end
    add_index :payment_terminals, [:payment_identity_id, :lane_id], unique: true
  end
end
