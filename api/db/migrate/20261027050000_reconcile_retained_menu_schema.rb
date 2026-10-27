class ReconcileRetainedMenuSchema < ActiveRecord::Migration[8.1]
  def up
    # These fields appeared in schema.rb without their staging migrations.
    # Existing schema-loaded and staging databases must retain their data.
    add_column :locations, :qr_code_url, :string unless column_exists?(:locations, :qr_code_url)

    {
      collection_type: [:string, { default: "standard", null: false }],
      starts_at: [:datetime, {}],
      ends_at: [:datetime, {}],
      is_featured: [:boolean, { default: false, null: false }],
      auto_hide: [:boolean, { default: false, null: false }],
      banner_text: [:string, {}]
    }.each do |name, (type, options)|
      add_column :collections, name, type, **options unless column_exists?(:collections, name)
    end

    add_index :collections, :collection_type unless index_exists?(:collections, :collection_type)
    add_index :collections, :is_featured unless index_exists?(:collections, :is_featured)
    add_index :collections, [:starts_at, :ends_at] unless index_exists?(:collections, [:starts_at, :ends_at])
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Reconciliation preserves pre-existing menu data"
  end
end
