require "rails_helper"
require "tempfile"
require Rails.root.join("lib/location_offering_mapping")

RSpec.describe LocationOfferingMapping do
  let!(:location) { create(:location) }
  let!(:other) { create(:location) }
  let!(:product) { create(:product) }
  let!(:row) { ProductLocation.create!(product: product, location: location, available: false, price_override_cents: 900) }
  def map_csv(text, **options)
    Tempfile.create(["offering", ".csv"]) do |file|
      file.write(text); file.flush
      described_class.call(path: file.path, out: StringIO.new, **options)
    end
  end
  def csv(value) = "location_slug,product_slug,offered\n#{location.slug},#{product.slug},#{value}\n"

  it "defaults to a no-write preview; repeated apply is idempotent and preserves daily/price fields" do
    expect(map_csv(csv(false))).to include(changed: 1, applied: false)
    expect(row.reload).to have_attributes(offered: true, available: false)
    expect(map_csv(csv(false), apply: true)).to include(changed: 1, applied: true)
    stamp = row.reload.updated_at
    expect(row).to have_attributes(offered: false, available: false, price_override_cents: 900)
    expect(map_csv(csv(false), apply: true)).to include(changed: 0)
    expect(row.reload.updated_at).to eq(stamp)
  end

  it "validates all rows before applying, rejecting unknown slugs, duplicates, invalid booleans and headers" do
    [csv(false) + "missing,#{product.slug},true\n", csv(false) + csv(true).lines.last, csv("0"), csv(false).strip + ",extra\n", "location_slug,product_slug,offered,offered\na,b,true,false\n"].each do |text|
      expect { map_csv(text, apply: true) }.to raise_error(ArgumentError)
      expect(row.reload.offered).to be(true)
    end
  end

  it "materializes a legacy product's other locations without disabling them" do
    row.destroy!
    map_csv(csv(false), apply: true)
    expect(product.product_locations.find_by!(location: other)).to have_attributes(offered: true, available: true)
    expect(product.product_locations.find_by!(location: location)).to have_attributes(offered: false, available: true)
  end
end
