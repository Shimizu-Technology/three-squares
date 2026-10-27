class EnforceUniqueProductCollections < ActiveRecord::Migration[8.1]
  def up
    # Keep writes out between cleanup and index creation. The migration's
    # transaction holds this lock until the unique index is in place.
    execute "LOCK TABLE product_collections IN SHARE ROW EXCLUSIVE MODE"
    execute <<~SQL
      DELETE FROM product_collections AS duplicate
      USING product_collections AS kept
      WHERE duplicate.collection_id = kept.collection_id
        AND duplicate.product_id = kept.product_id
        AND duplicate.id > kept.id
    SQL
    add_index :product_collections, [:collection_id, :product_id], unique: true
  end

  def down
    remove_index :product_collections, [:collection_id, :product_id]
  end
end
