class AddLocationsAndFulfillmentModeling < ActiveRecord::Migration[8.1]
  def up
    create_table :locations do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :address
      t.string :phone
      t.jsonb :hours_json, null: false, default: {}
      t.boolean :active, null: false, default: true

      t.timestamps
    end
    add_index :locations, :slug, unique: true
    add_index :locations, :active

    create_table :product_locations do |t|
      t.references :product, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.boolean :available, null: false, default: true
      t.integer :price_override_cents

      t.timestamps
    end
    add_index :product_locations, [ :product_id, :location_id ], unique: true
    add_index :product_locations, :available

    add_column :products, :allow_pickup, :boolean, null: false, default: true
    add_column :products, :allow_shipping, :boolean, null: false, default: false
    add_index :products, :allow_pickup
    add_index :products, :allow_shipping

    add_column :orders, :fulfillment_type, :string, null: false, default: "shipping"
    add_reference :orders, :location, foreign_key: true
    add_index :orders, :fulfillment_type

    execute <<~SQL.squish
      INSERT INTO locations (name, slug, address, phone, hours_json, active, created_at, updated_at)
      VALUES
        (
          'Three Squares Main',
          'three-squares-main',
          '416 Chalan San Antonio, Tamuning, GU 96913',
          '(671) 646-2652',
          '{"Tuesday - Saturday":"8:00 AM - 8:00 PM","Sunday":"8:00 AM - 5:00 PM","Monday":"Closed"}'::jsonb,
          TRUE,
          NOW(),
          NOW()
        ),
        (
          'Three Squares @ Donki',
          'three-squares-donki',
          'Inside Don Quijote, Tamuning, GU',
          '(671) 646-2652',
          '{"Daily":"10:00 AM - 10:00 PM"}'::jsonb,
          TRUE,
          NOW(),
          NOW()
        )
      ON CONFLICT (slug) DO NOTHING;
    SQL

    # Backfill fulfillment flags with conservative defaults:
    # - shippable products: both shipping + pickup
    # - everything else: pickup only
    execute <<~SQL.squish
      UPDATE products
      SET
        allow_pickup = TRUE,
        allow_shipping = CASE WHEN product_type = 'shippable' THEN TRUE ELSE FALSE END
    SQL

    # Backfill order fulfillment type from existing order semantics.
    execute <<~SQL.squish
      UPDATE orders
      SET fulfillment_type = CASE
        WHEN order_type = 'acai' THEN 'pickup'
        ELSE 'shipping'
      END
    SQL

    main_location_id = select_value("SELECT id FROM locations WHERE slug = 'three-squares-main' LIMIT 1")
    if main_location_id.present?
      execute(
        ActiveRecord::Base.sanitize_sql_array([
          "UPDATE orders SET location_id = ? WHERE fulfillment_type = 'pickup' AND location_id IS NULL",
          main_location_id
        ])
      )
    end

    # Default every product to Main location availability.
    execute <<~SQL.squish
      INSERT INTO product_locations (product_id, location_id, available, created_at, updated_at)
      SELECT p.id, l.id, TRUE, NOW(), NOW()
      FROM products p
      JOIN locations l ON l.slug = 'three-squares-main'
      ON CONFLICT (product_id, location_id) DO UPDATE SET available = EXCLUDED.available, updated_at = NOW();
    SQL

    # Donki collection products are available at Donki, and restricted from Main.
    execute <<~SQL.squish
      INSERT INTO product_locations (product_id, location_id, available, created_at, updated_at)
      SELECT DISTINCT pc.product_id, l.id, TRUE, NOW(), NOW()
      FROM product_collections pc
      JOIN collections c ON c.id = pc.collection_id
      JOIN locations l ON l.slug = 'three-squares-donki'
      WHERE c.slug = 'donki'
      ON CONFLICT (product_id, location_id) DO UPDATE SET available = EXCLUDED.available, updated_at = NOW();
    SQL

    execute <<~SQL.squish
      UPDATE product_locations
      SET available = FALSE, updated_at = NOW()
      WHERE location_id = (SELECT id FROM locations WHERE slug = 'three-squares-main' LIMIT 1)
        AND product_id IN (
          SELECT DISTINCT pc.product_id
          FROM product_collections pc
          JOIN collections c ON c.id = pc.collection_id
          WHERE c.slug = 'donki'
        );
    SQL
  end

  def down
    remove_index :orders, :fulfillment_type
    remove_reference :orders, :location, foreign_key: true
    remove_column :orders, :fulfillment_type

    remove_index :products, :allow_shipping
    remove_index :products, :allow_pickup
    remove_column :products, :allow_shipping
    remove_column :products, :allow_pickup

    drop_table :product_locations
    drop_table :locations
  end
end

