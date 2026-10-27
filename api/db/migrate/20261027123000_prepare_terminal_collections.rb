class PrepareTerminalCollections < ActiveRecord::Migration[8.1]
  def change
    add_reference :payment_attempts, :payment_terminal, foreign_key: true
    add_column :payment_attempts, :collection_mode, :string, null: false, default: "hosted"
    add_column :payment_attempts, :cancel_requested_at, :datetime
    add_column :payment_attempts, :simulation_offset_seconds, :integer, null: false, default: 0
    add_check_constraint :payment_attempts, "collection_mode IN ('hosted', 'terminal')", name: "payment_collection_mode"
    add_check_constraint :payment_attempts, "simulation_offset_seconds BETWEEN 0 AND 31536000", name: "simulation_attempt_time_bounds"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          UPDATE payment_attempts SET collection_mode = 'terminal'
          FROM checkout_sessions WHERE checkout_sessions.id = payment_attempts.checkout_session_id
          AND checkout_sessions.channel = 'pos'
        SQL
      end
    end

    add_reference :payment_terminals, :payment_profile, foreign_key: true
    add_column :payment_terminals, :enabled, :boolean, null: false, default: true
    add_column :payment_terminals, :connection_state, :string, null: false, default: "unknown"
    add_column :payment_terminals, :connection_verified_at, :datetime
    add_column :payment_terminals, :device_serial, :string
    add_column :payment_terminals, :device_model, :string
    add_column :payment_terminals, :device_firmware, :string
    add_column :payment_terminals, :command_token, :uuid
    add_column :payment_terminals, :command_claimed_at, :datetime
    add_check_constraint :payment_terminals, "connection_state IN ('unknown', 'connected', 'offline')", name: "terminal_connection_state"
    add_index :payment_terminals, :leased_attempt_id, unique: true, where: "leased_attempt_id IS NOT NULL", name: "one_reader_per_attempt"

    create_table :terminal_administrations, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :payment_identity, type: :uuid, null: false, foreign_key: true
      t.references :payment_profile, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.references :payment_terminal, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :lane_id, null: false
      t.string :terminal_reference, null: false
      t.string :label, null: false
      t.string :kind, null: false
      t.string :state, null: false, default: "reserved"
      t.uuid :operation_key, null: false
      t.string :payload_digest, null: false
      t.datetime :dispatched_at
      t.datetime :completed_at
      t.string :error_classification
      t.jsonb :facts, null: false, default: {}
      t.timestamps
      t.index [:payment_identity_id, :operation_key], unique: true, name: "terminal_admin_operation_key"
      t.index [:payment_identity_id, :lane_id], unique: true, where: "state IN ('reserved', 'dispatching', 'unknown')", name: "one_terminal_administration_per_lane"
      t.check_constraint "state IN ('reserved', 'dispatching', 'unknown', 'succeeded', 'failed')", name: "terminal_administration_state"
      t.check_constraint "kind IN ('pair', 'update', 'retire')", name: "terminal_administration_kind"
    end
    add_column :refund_observations, :facts, :jsonb, null: false, default: {}
    # The mode/reader are readonly model attributes and part of all three frozen
    # snapshot copies; dispatch/finalization reject a changed binding. Keep the
    # database shape replayable through the repository's Ruby schema format.
  end
end
