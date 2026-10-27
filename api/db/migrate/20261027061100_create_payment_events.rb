class CreatePaymentEvents < ActiveRecord::Migration[8.1]
  def up
    create_table :payment_events, id: :uuid, if_not_exists: true do |t|
      t.references :payment_identity, type: :uuid, foreign_key: true
      t.string :provider, :external_account_id, :environment, :external_event_id, :payload_digest, null: false
      t.jsonb :facts, null: false, default: {}
      t.datetime :processed_at
      t.timestamps
    end
    add_index :payment_events, [:provider, :external_account_id, :environment, :external_event_id], unique: true, name: 'unique_external_payment_event', if_not_exists: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
