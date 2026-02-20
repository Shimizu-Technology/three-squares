class AddBusinessLineToProducts < ActiveRecord::Migration[8.0]
  def up
    # Add business_line to products
    add_column :products, :business_line, :string, default: "three_squares", null: false
    add_index :products, :business_line

    # Add business_line to collections
    add_column :collections, :business_line, :string, default: "three_squares", null: false
    add_index :collections, :business_line

    # Backfill: infer business_line from collection slugs for existing products
    cookie_collection_ids = Collection.where("slug IN (?)", %w[cookies cookie-boxes mini-cookies]).pluck(:id)
    catering_collection_ids = Collection.where("slug LIKE ?", "catering-%").pluck(:id)

    # Mark cookie collections
    Collection.where(id: cookie_collection_ids).update_all(business_line: "latte_stone_cookies")
    # Mark catering collections
    Collection.where(id: catering_collection_ids).update_all(business_line: "bgpacific")

    # Mark products in cookie collections as latte_stone_cookies
    if cookie_collection_ids.any?
      product_ids = ProductCollection.where(collection_id: cookie_collection_ids).pluck(:product_id).uniq
      Product.where(id: product_ids).update_all(business_line: "latte_stone_cookies")
    end

    # Mark products in catering collections as bgpacific
    if catering_collection_ids.any?
      product_ids = ProductCollection.where(collection_id: catering_collection_ids).pluck(:product_id).uniq
      Product.where(id: product_ids).update_all(business_line: "bgpacific")
    end

    # Everything else stays as default 'three_squares'
  end

  def down
    remove_index :products, :business_line
    remove_column :products, :business_line
    remove_index :collections, :business_line
    remove_column :collections, :business_line
  end
end
