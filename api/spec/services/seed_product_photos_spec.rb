require "rails_helper"
require Rails.root.join("db/seed_data/product_photos")

RSpec.describe SeedProductPhotos do
  def legacy_attributes(slug)
    url = described_class::LEGACY_IMAGES.fetch(slug)
    { url: url, s3_key: url.delete_prefix("https://three-squares.s3.ap-southeast-2.amazonaws.com/") }
  end

  it "removes only an exact legacy stand-in and preserves/reassigns custom uploads" do
    product = create(:product, slug: "french-toast-bacon-eggs")
    legacy = product.product_images.create!(**legacy_attributes(product.slug), primary: true, position: 0)
    custom = product.product_images.create!(url: "https://example.test/real-toast.jpg", s3_key: "custom/toast", position: 1)
    other_key = product.product_images.create!(**legacy_attributes(product.slug).merge(s3_key: "custom/other"), position: 2)

    expect(described_class.apply!).to include(removed: 1)
    expect(ProductImage.exists?(legacy.id)).to be(false)
    expect(product.product_images.pluck(:id)).to contain_exactly(custom.id, other_key.id)
    expect(custom.reload.primary).to be(true)
    expect(described_class.apply!).to eq(created: 0, removed: 0)
  end

  it "creates a verified dish photo once and leaves an unverified dish without a photo" do
    burger = create(:product, slug: "cheeseburger")
    toast = create(:product, slug: "french-toast-bacon-eggs")

    expect(described_class.apply!).to eq(created: 1, removed: 0)
    expect(burger.product_images.first).to have_attributes(**legacy_attributes(burger.slug), primary: true, alt_text: burger.name)
    expect(toast.product_images).to be_empty
    expect(described_class.apply!).to eq(created: 0, removed: 0)
  end

  it "does not replace an existing custom image with a seed image" do
    burger = create(:product, slug: "cheeseburger")
    custom = burger.product_images.create!(url: "https://example.test/new-burger.jpg", s3_key: "custom/burger")

    expect(described_class.apply!).to eq(created: 0, removed: 0)
    expect(burger.product_images.pluck(:id)).to eq([custom.id])
  end

  it "leaves images attached to products outside the legacy seed map unchanged" do
    product = create(:product, slug: "custom-menu-item")
    image = product.product_images.create!(**legacy_attributes("french-toast-bacon-eggs"))

    expect(described_class.apply!).to eq(created: 0, removed: 0)
    expect(image.reload).to be_persisted
  end

  it "preserves deferred cookie seed behavior without claiming photo approval" do
    cookie = create(:product, slug: "cookies-30pc-grand")

    expect(described_class.apply!).to eq(created: 1, removed: 0)
    expect(cookie.product_images.first).to have_attributes(**legacy_attributes(cookie.slug))
    expect(described_class.apply!).to eq(created: 0, removed: 0)
  end
end
