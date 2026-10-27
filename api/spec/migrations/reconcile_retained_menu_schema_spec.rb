require "rails_helper"
require Rails.root.join("db/migrate/20261027050000_reconcile_retained_menu_schema")

RSpec.describe ReconcileRetainedMenuSchema do
  after do
    # Transactional DDL rolls back, but Active Record's column cache does not.
    [Location, Product, Collection].each(&:reset_column_information)
  end

  def reconcile
    ActiveRecord::Migration.suppress_messages { described_class.new.migrate(:up) }
  end

  it "preserves menu values and indexes when the retained columns already exist" do
    collection = create(:collection, collection_type: "seasonal", banner_text: "Thanksgiving pickup",
      starts_at: Time.utc(2026, 11, 1), ends_at: Time.utc(2026, 11, 26), auto_hide: true, is_featured: true)
    location = Location.create!(name: "Main", slug: "main", qr_code_url: "https://example.test/menu/main")
    expected = collection.attributes
    indexes = ActiveRecord::Base.connection.indexes(:collections).map(&:name).sort

    2.times { reconcile }

    expect(collection.reload.attributes).to eq(expected)
    expect(location.reload.qr_code_url).to eq("https://example.test/menu/main")
    expect(ActiveRecord::Base.connection.indexes(:collections).map(&:name).sort).to eq(indexes)
  end

  it "leaves deferred columns and data from old main/staging schema shapes intact" do
    # Old main's dump and staging's migration replay have the same residue.
    # DDL is rolled back with this example's transaction, on the isolated test DB.
    connection = ActiveRecord::Base.connection
    connection.add_column :locations, :location_type, :string, default: "permanent", null: false
    connection.add_column :products, :business_line, :string, default: "three_squares", null: false
    connection.add_index :locations, :location_type
    location = Location.create!(name: "Legacy", slug: "legacy")
    product = create(:product)
    connection.execute("UPDATE locations SET location_type = 'event' WHERE id = #{location.id.to_i}")
    connection.execute("UPDATE products SET business_line = 'legacy-line' WHERE id = #{product.id.to_i}")

    reconcile

    expect(connection.select_value("SELECT location_type FROM locations WHERE id = #{location.id.to_i}")).to eq("event")
    expect(connection.select_value("SELECT business_line FROM products WHERE id = #{product.id.to_i}")).to eq("legacy-line")
    expect(connection.index_exists?(:locations, :location_type)).to be(true)
  end
end
