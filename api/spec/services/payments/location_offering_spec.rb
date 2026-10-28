require "rails_helper"

RSpec.describe "Offering enforcement under inventory locks" do
  let!(:location) { create(:location) }
  let!(:product) { create(:product, product_type: "local", allow_pickup: true, allow_shipping: false, inventory_level: "product", product_stock_quantity: 3) }
  let!(:row) { ProductLocation.create!(product: product, location: location, offered: true, available: true) }
  let!(:order) { create(:order, source: "pos", staff_created: true, fulfillment_type: "pickup", location: location, payment_method: "cash", payment_environment: "sandbox") }
  before { order.order_items.create!(product: product, product_variant: product.product_variants.first, quantity: 1, unit_price_cents: 2500) }

  it "rejects reservation for a removed offering, including items with untracked stock" do
    row.update!(offered: false)
    ["product", "none"].each do |level|
      product.update!(inventory_level: level)
      expect { Payments::ReserveInventory.call(order: order, expires_at: 10.minutes.from_now) }.to raise_error(Payments::ReserveInventory::Unavailable, /not offered/)
    end
    expect(InventoryReservation.count).to eq(0)
  end

  it "rejects a stale eligible product at final inventory commit and preserves stock/held reservations" do
    Payments::ReserveInventory.call(order: order, expires_at: 10.minutes.from_now)
    # Emulate an eligibility read that preceded a membership change; commit's
    # existing product lock must reload the authoritative membership itself.
    allow(Payments::Eligibility).to receive(:validate_order!).and_return(true)
    LocationOffering.set!(product: product, location: location, offered: false)
    expect { Payments::FinalizeOrder.call_cash(order: order) }.to raise_error(Payments::ReserveInventory::Unavailable, /not offered/)
    expect(order.reload.payment_status).to eq("pending")
    expect(product.reload.product_stock_quantity).to eq(3)
    expect(InventoryCommitment.count).to eq(0)
    expect(InventoryReservation.find_by!(order: order).state).to eq("held")
  end

  it "enforces the same membership through real eligibility without relying on a price override" do
    row.update!(offered: false)
    expect { Payments::Eligibility.validate_order!(order) }.to raise_error(Payments::FulfillmentError, /not available/)
    expect(FulfillmentValidator.shared_pickup_location_ids_for_products([product])).to eq([])
    expect(FulfillmentValidator.pickup_location_incompatible_for_pickup_only?([product])).to be(true)
  end
end
