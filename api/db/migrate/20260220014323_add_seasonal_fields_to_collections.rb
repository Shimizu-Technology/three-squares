class AddSeasonalFieldsToCollections < ActiveRecord::Migration[8.1]
  def change
    add_column :collections, :collection_type, :string, default: "standard", null: false
    add_column :collections, :starts_at, :datetime
    add_column :collections, :ends_at, :datetime
    add_column :collections, :is_featured, :boolean, default: false, null: false
    add_column :collections, :auto_hide, :boolean, default: false, null: false
    add_column :collections, :banner_text, :string

    add_index :collections, :collection_type
    add_index :collections, :is_featured
    add_index :collections, [:starts_at, :ends_at]
  end
end
