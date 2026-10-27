require "rails_helper"
require Rails.root.join("lib/seed_product_catalog")

RSpec.describe SeedProductCatalog do
  let!(:main) { create(:location, slug: "three-squares-main") }
  let!(:cookies) { create(:collection, slug: "cookie-boxes") }
  let(:attrs) { { name: "Seed cookie box", slug: "seed-cookie-box", price: 12, collection_slug: cookies.slug, requires_shipping: true } }

  it "sets a known positive product/default-option weight before enabling shipping" do
    product = described_class.create_product(attrs.merge(weight_oz: 24))
    expect(product.reload).to have_attributes(allow_shipping: true, weight_oz: 24)
    expect(product.product_variants.sole.weight_oz).to eq(24)
    expect(product.product_locations.available.pluck(:location_id)).to eq([ main.id ])
    expect(described_class.create_product(attrs).reload).to have_attributes(allow_shipping: true, weight_oz: 24)
  end

  it "keeps unweighed cookie seeds pickup-only instead of fabricating a shipping weight" do
    product = described_class.create_product(attrs)
    expect(product.reload).to have_attributes(allow_pickup: true, allow_shipping: false, weight_oz: nil)
    expect(product.product_variants.sole).to have_attributes(available: true, weight_oz: nil)
  end

  it "preserves compatible legacy shipping configuration with measured option weights" do
    product = described_class.create_product(attrs)
    product.product_variants.sole.update!(weight_oz: 8)
    product.update_columns(allow_shipping: true)
    expect(described_class.create_product(attrs).reload).to have_attributes(allow_shipping: true, weight_oz: nil)
    expect(product.product_variants.sole.reload.weight_oz).to eq(8)
  end
end
