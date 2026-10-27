require "rails_helper"

RSpec.describe CatalogPrice do
  let(:location) { create(:location, name: "Donki") }
  let(:product) { create(:product, product_type: "local", base_price_cents: 1250) }
  let(:variant) { product.product_variants.first }
  def price(**options) = described_class.resolve(product: product.reload, variant: variant.reload, **options)
  def sql_price = Product.where(id: product.id).pick(Arel.sql(described_class.sql(location_id: location.id)))

  it "resolves variant, sale, then uniform location override with a truthful was price" do
    variant.update!(price_cents: 1400)
    expect(price.unit_price_cents).to eq(1400)
    product.update!(sale_price_cents: 900)
    expect(price.to_h).to include(unit_price_cents: 900, compare_at_price_cents: 1400)
    expect(sql_price).to eq(900)
    ProductLocation.create!(product: product, location: location, available: true, price_override_cents: 1050)
    expect(price(location_id: location.id).to_h).to include(unit_price_cents: 1050, compare_at_price_cents: nil)
    expect(sql_price).to eq(1050)
    expect(price.unit_price_cents).to eq(900)
  end

  it "rejects ambiguous overrides and ignores legacy overrides for differently priced sizes" do
    variant.update!(price_cents: 1000)
    large = create(:product_variant, product: product, price_cents: 1800, variant_key: "large")
    row = ProductLocation.new(product: product.reload, location: location, available: true, price_override_cents: 1500)
    expect(row).not_to be_valid
    expect(row.errors.full_messages.join).to include("single Donki price can't be set")
    row.save!(validate: false)
    expect(price(location_id: location.id).unit_price_cents).to eq(1000)
    expect(described_class.resolve(product: product, variant: large, location_id: location.id).unit_price_cents).to eq(1800)
    expect(described_class.resolve(product: product, location_id: location.id).price_varies).to be(true)
    expect(sql_price).to eq(1000)
  end

  it "allows a location override when multiple variants share a price" do
    create(:product_variant, product: product, price_cents: 1250, variant_key: "second")
    ProductLocation.create!(product: product.reload, location: location, available: true, price_override_cents: 1150)
    expect(price(location_id: location.id).unit_price_cents).to eq(1150)
    expect(sql_price).to eq(1150)
  end

  it "does not strike through a lower or unrelated regular price" do
    product.update!(sale_price_cents: 1500)
    expect(price.to_h).to include(unit_price_cents: 1500, compare_at_price_cents: nil)
  end

  %w[market_price quote_only].each do |type|
    it "rejects #{type} placeholders" do
      product.update!(product_type: type)
      expect(price.to_h).to include(unit_price_cents: nil, purchasable: false)
      expect(sql_price).to be_nil
      expect { variant.effective_unit_price_cents }.to raise_error(CheckoutPricingService::PricingError)
    end
  end

  it "distinguishes unresolved zero from explicit complimentary tea with a meal" do
    variant.update!(price_cents: 0)
    expect(price.purchasable).to be(false)
    product.update!(product_type: "complimentary_with_meal")
    expect(price.purchasable).to be(true)
    tea = CartItem.new(product_variant: variant.reload, quantity: 1)
    expect { Payments::Eligibility.validate_complimentary!([tea]) }.to raise_error(Payments::FulfillmentError, /with a meal/)
    meal = create(:product, product_type: "local")
    expect { Payments::Eligibility.validate_complimentary!([tea, CartItem.new(product_variant: meal.product_variants.first)]) }.not_to raise_error
  end

  it "rounds decimal input instead of truncating cents" do
    product.base_price = 8.95
    variant.price = 9.95
    expect(product.base_price_cents).to eq(895)
    expect(variant.price_cents).to eq(995)
  end
end
