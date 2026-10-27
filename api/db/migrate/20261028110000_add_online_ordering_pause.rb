class AddOnlineOrderingPause < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :online_ordering_paused, :boolean, null: false, default: false
    add_column :site_settings, :online_ordering_pause_message, :string, limit: 240
    create_table :online_ordering_changes do |t|
      t.references :actor, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :actor_label, null: false
      t.boolean :paused, null: false
      t.string :customer_message, limit: 240
      t.datetime :created_at, null: false
    end
  end
end
