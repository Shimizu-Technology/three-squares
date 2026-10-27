require "rails_helper"
require Rails.root.join("db/migrate/20261028100000_enforce_unique_product_collections")

RSpec.describe EnforceUniqueProductCollections do
  def migrate(direction)
    ActiveRecord::Migration.suppress_messages { described_class.new.migrate(direction) }
    ProductCollection.reset_column_information
  end

  after { ProductCollection.reset_column_information }

  it "keeps the lowest id and its position without changing other collections or menu ordering" do
    migrate(:down)
    collection = create(:collection)
    other_collection = create(:collection)
    first, second, third = create_list(:product, 3)
    kept = ProductCollection.create!(collection: collection, product: first, position: 20)
    earlier = ProductCollection.create!(collection: collection, product: second, position: 10)
    unpositioned = ProductCollection.create!(collection: collection, product: third, position: nil)
    other = ProductCollection.create!(collection: other_collection, product: first, position: 5)
    expected = [kept, earlier, unpositioned, other].map(&:attributes)
    ProductCollection.insert_all!([
      { collection_id: collection.id, product_id: first.id, position: 1 },
      { collection_id: collection.id, product_id: first.id, position: 99 },
      { collection_id: collection.id, product_id: second.id, position: nil }
    ])

    migrate(:up)

    expect(ProductCollection.order(:id).map(&:attributes)).to eq(expected)
    expect(collection.product_collections.order(Arel.sql("position ASC NULLS LAST"), :id).pluck(:product_id))
      .to eq([second.id, first.id, third.id])
    migrate(:down)
    expect(ProductCollection.order(:id).map(&:attributes)).to eq(expected)
    expect(ActiveRecord::Base.connection.index_exists?(:product_collections, [:collection_id, :product_id])).to be(false)
  end

  it "rejects bulk inserts that bypass model validation while allowing a product in different collections" do
    product = create(:product)
    collection, other = create_list(:collection, 2)
    ProductCollection.insert_all!([{ collection_id: collection.id, product_id: product.id }])
    ProductCollection.insert_all!([{ collection_id: other.id, product_id: product.id }])

    expect do
      ProductCollection.transaction(requires_new: true) do
        ProductCollection.insert_all!([{ collection_id: collection.id, product_id: product.id }])
      end
    end.to raise_error(ActiveRecord::RecordNotUnique)
    expect(ProductCollection.count).to eq(2)
  end
end
