require "rails_helper"
require "ostruct"

RSpec.describe FulfillmentValidator do
  def cart_item_for(product, id: 1)
    OpenStruct.new(
      id: id,
      product_variant: OpenStruct.new(product: product)
    )
  end

  describe ".mixed_cart_incompatible?" do
    it "returns true for pickup-only + shipping-only products" do
      pickup_only = create(:product, allow_pickup: true, allow_shipping: false)
      shipping_only = create(:product, allow_pickup: false, allow_shipping: true)

      result = described_class.mixed_cart_incompatible?([ pickup_only, shipping_only ])
      expect(result).to be(true)
    end
  end

  describe ".validate_cart" do
    let!(:main_location) { Location.create!(name: "Main", slug: "main", active: true) }
    let!(:donki_location) { Location.create!(name: "Donki", slug: "donki", active: true) }

    it "requires location for pickup validation" do
      product = create(:product, allow_pickup: true, allow_shipping: false)
      item = cart_item_for(product)

      issues = described_class.validate_cart(
        cart_items: [ item ],
        fulfillment_type: "pickup",
        location_id: nil
      )

      expect(issues.first[:type]).to eq("location_required")
    end

    it "blocks pickup when product is not available at selected location" do
      product = create(:product, allow_pickup: true, allow_shipping: false)
      ProductLocation.create!(product: product, location: main_location, available: true)
      ProductLocation.create!(product: product, location: donki_location, available: false)
      item = cart_item_for(product)

      issues = described_class.validate_cart(
        cart_items: [ item ],
        fulfillment_type: "pickup",
        location_id: donki_location.id
      )

      expect(issues.first[:type]).to eq("location_unavailable")
    end
  end
end

