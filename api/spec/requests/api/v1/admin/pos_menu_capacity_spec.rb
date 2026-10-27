require "rails_helper"

RSpec.describe "POS menu inventory capacity", type: :request do
  let!(:location) { create(:location) }
  let(:actor) { create(:user, :staff, assigned_location: location) }

  before do
    allow_any_instance_of(Api::V1::Admin::PosMenuController).to receive(:current_user).and_return(actor)
  end

  def menu_variants
    get "/api/v1/admin/pos/menu", params: { location_id: location.id }
    expect(response).to have_http_status(:ok)
    response.parsed_body.fetch("categories").flat_map { |category| category.fetch("items") }.flat_map { |item| item.fetch("variants") }
  end

  def hold(pool, quantity, **attrs)
    InventoryReservation.create!(order: create(:order, location: location), pool_type: pool.class.name,
      pool_id: pool.id, quantity: quantity, state: "held", expires_at: 10.minutes.from_now, **attrs)
  end

  it "uses one shared product pool across variants, subtracting only live holds" do
    product = create(:product, published: true, inventory_level: "product", product_stock_quantity: 5)
    first = product.product_variants.first
    second = create(:product_variant, product: product, stock_quantity: 99)
    hold(product, 2)
    hold(product, 20, expires_at: 1.minute.ago)
    hold(product, 20, state: "released")
    rows = menu_variants.select { |row| [ first.id, second.id ].include?(row.fetch("id")) }
    expect(rows.size).to eq(2)
    expect(rows.map { |row| row.fetch("inventory_pool_key") }.uniq).to eq([ "Product:#{product.id}" ])
    expect(rows.map { |row| row.fetch("available_quantity") }).to eq([ 3, 3 ])
    expect(rows).to all(include("in_stock" => true))
    product.update!(product_stock_quantity: 0)
    expect(menu_variants.select { |row| [ first.id, second.id ].include?(row.fetch("id")) }).to all(include("in_stock" => false, "available_quantity" => 0))
  end

  it "keeps variant pools independent and untracked variants unlimited" do
    tracked = create(:product, published: true, inventory_level: "variant")
    first = create(:product_variant, product: tracked, stock_quantity: 4)
    second = create(:product_variant, product: tracked, stock_quantity: 6)
    hold(first, 4)
    unlimited = create(:product, published: true, inventory_level: "none").product_variants.first
    rows = menu_variants.index_by { |row| row.fetch("id") }
    expect(rows.fetch(first.id)).to include("in_stock" => false, "available_quantity" => 0, "inventory_pool_key" => "ProductVariant:#{first.id}")
    expect(rows.fetch(second.id)).to include("in_stock" => true, "available_quantity" => 6, "inventory_pool_key" => "ProductVariant:#{second.id}")
    expect(rows.fetch(unlimited.id)).to include("in_stock" => true, "available_quantity" => nil, "inventory_pool_key" => nil)
  end
end
