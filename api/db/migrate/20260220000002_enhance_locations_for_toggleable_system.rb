class EnhanceLocationsForToggleableSystem < ActiveRecord::Migration[8.0]
  def change
    add_column :locations, :location_type, :string, default: "permanent", null: false
    add_column :locations, :starts_at, :datetime
    add_column :locations, :ends_at, :datetime
    add_column :locations, :auto_deactivate, :boolean, default: false, null: false
    add_column :locations, :description, :text
    add_column :locations, :qr_code_url, :string
    add_reference :locations, :menu_collection, foreign_key: { to_table: :collections }, null: true

    add_index :locations, :location_type
    add_index :locations, [ :active, :location_type ]
  end
end
