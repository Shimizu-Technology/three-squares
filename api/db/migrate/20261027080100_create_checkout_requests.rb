class CreateCheckoutRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :checkout_requests do |t|
      t.string :owner_key, null: false
      t.string :caller_idempotency_key, null: false
      t.string :request_digest, null: false
      t.string :outcome, null: false
      t.references :checkout_session, type: :uuid, foreign_key: true
      t.string :rejection_message
      t.timestamps
    end
    add_index :checkout_requests, [:owner_key, :caller_idempotency_key], unique: true, name: 'unique_checkout_decision'
    add_check_constraint :checkout_requests,
      "(outcome = 'resolving' AND checkout_session_id IS NULL AND rejection_message IS NULL) OR " \
      "(outcome = 'accepted' AND checkout_session_id IS NOT NULL AND rejection_message IS NULL) OR " \
      "(outcome = 'rejected' AND checkout_session_id IS NULL AND rejection_message IS NOT NULL)", name: 'checkout_decision_shape'
  end
end
