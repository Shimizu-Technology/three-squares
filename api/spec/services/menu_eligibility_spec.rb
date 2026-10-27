require "rails_helper"

RSpec.describe MenuEligibility do
  let(:at) { Time.zone.parse("2026-12-25 00:00:00") }

  it "preserves existing behavior without scheduled/special associations" do
    unclassified = create(:product)
    unpublished_regular = create(:product, collections: [create(:collection, published: false)])
    [unclassified, unpublished_regular].each do |product|
      expect(described_class.enabled?(product, at: at)).to be(true)
      expect(described_class.scope(Product.where(id: product.id), at: at)).to exist
    end
  end

  it "agrees with SQL for every pair of publication/window/type combinations and boundaries" do
    collections = [
      create(:collection),
      create(:collection, published: false),
      create(:collection, collection_type: "event"),
      create(:collection, collection_type: "limited_time", published: false),
      create(:collection, collection_type: "seasonal", starts_at: at, ends_at: at + 1.hour),
      create(:collection, starts_at: at + 1.hour),
      create(:collection, ends_at: at, auto_hide: true),
      create(:collection, ends_at: at, auto_hide: false),
      create(:collection, starts_at: at - 1.hour, ends_at: at + 1.hour, published: false)
    ]
    products = collections.map { |collection| create(:product, collections: [collection]) }
    products += collections.combination(2).map { |pair| create(:product, collections: pair) }
    products << create(:product)

    [at - 1.second, at, at + 1.hour, at + 2.hours].each do |instant|
      expected = products.select do |product|
        memberships = product.collections.to_a
        special = memberships.any? { |c| c.collection_type != "standard" || c.starts_at || c.ends_at }
        !special || memberships.any? { |c| c.published && (!c.starts_at || c.starts_at <= instant) && (!c.ends_at || c.ends_at > instant) }
      end.map(&:id)
      expect(described_class.scope(Product.all, at: instant).pluck(:id)).to match_array(expected)
      loaded_products = Product.includes(:collections).where(id: products.map(&:id))
      expect(loaded_products.select { |product| described_class.enabled?(product, at: instant) }.map(&:id)).to match_array(expected)
    end
  end

  it "responds to publication changes and supports a historical time without publication mutation" do
    collection = create(:collection, collection_type: "seasonal", starts_at: at, ends_at: at + 1.hour)
    product = create(:product, collections: [collection])
    expect(described_class.enabled?(product, at: at)).to be(true)
    expect(described_class.enabled?(product, at: at + 1.hour)).to be(false)
    collection.update!(published: false)
    expect(described_class.enabled?(product.reload, at: at)).to be(false)
    expect(described_class.scope(Product.all, at: at)).not_to include(product)
    collection.update!(published: true)
    expect(described_class.enabled?(product.reload, at: at)).to be(true)
    expect(described_class.scope(Product.all, at: at)).to include(product)
    expect(collection.reload).to be_published
  end

  it "keeps a shared product available through a published regular menu, regardless of auto-hide" do
    regular = create(:collection)
    [true, false].each do |auto_hide|
      expired = create(:collection, collection_type: "event", ends_at: at, auto_hide: auto_hide)
      exclusive = create(:product, collections: [expired])
      shared = create(:product, collections: [expired, regular])
      expect(described_class.enabled?(exclusive, at: at)).to be(false)
      expect(described_class.enabled?(shared, at: at)).to be(true)
      expect(described_class.scope(Product.all, at: at)).to include(shared)
      expect(described_class.scope(Product.all, at: at)).not_to include(exclusive)
    end
  end
end
