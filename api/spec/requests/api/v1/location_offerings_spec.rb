require "rails_helper"
require Rails.root.join("spec/support/payment_foundation_helpers")

RSpec.describe "Location menu offerings", type: :request do
  include PaymentFoundationHelpers
  let!(:main) { create(:location, slug: "three-squares-main", hours_json: {"Daily" => "00:00-23:59"}) }
  let!(:donki) { create(:location, slug: "three-squares-donki", hours_json: {"Daily" => "00:00-23:59"}) }
  let!(:collection) { create(:collection, published: true) }
  let!(:meal) { create(:product, product_type: "local", allow_pickup: true, allow_shipping: false, published: true, inventory_level: "product", product_stock_quantity: 5) }
  let(:actor) { create(:user, :owner) }
  let!(:row) { ProductLocation.create!(product: meal, location: donki, offered: false, available: true, price_override_cents: 900) }
  let(:path) { "/api/v1/admin/products/#{meal.id}/offerings" }

  before do
    meal.collections << collection
    ProductLocation.create!(product: meal, location: main, available: true)
    [Api::V1::Admin::ProductOfferingsController, Api::V1::Admin::ProductsController, Api::V1::Admin::PosMenuController, Api::V1::Admin::PosOrdersController].each do |controller|
      allow_any_instance_of(controller).to receive(:current_user).and_return(actor)
    end
  end

  def change_offering(value, **extra)
    patch path, params: {offering: {location_id: donki.id, offered: value, **extra}}, as: :json
  end

  def pos_items(location, manage: true)
    get "/api/v1/admin/pos/menu", params: {location_id: location.id, include_unavailable: manage.to_s}
    expect(response).to have_http_status(:ok)
    response.parsed_body.fetch("categories").flat_map { |category| category.fetch("items") }
  end

  it "hides non-carried items in public lists, collection menus, direct URLs and both POS modes" do
    get "/api/v1/products", params: {location_id: donki.id}
    expect(response.parsed_body.fetch("products")).to be_empty
    get "/api/v1/collections/#{collection.slug}", params: {location_id: donki.id}
    expect(response.parsed_body.fetch("products")).to be_empty
    get "/api/v1/products/#{meal.slug}", params: {location_id: donki.id}
    expect(response).to have_http_status(:not_found)
    expect(pos_items(donki)).to be_empty
    expect(pos_items(donki, manage: false)).to be_empty
    expect(pos_items(main).map { |item| item.fetch("id") }).to include(meal.id)
  end

  it "keeps offered sold-out items visible to customers and manageable at POS" do
    row.update!(offered: true, available: false)
    get "/api/v1/products", params: {location_id: donki.id}
    expect(response.parsed_body.fetch("products").sole).to include("id" => meal.id, "actually_available" => false)
    get "/api/v1/collections/#{collection.slug}", params: {location_id: donki.id}
    expect(response.parsed_body.fetch("products").sole).to include("actually_available" => false)
    get "/api/v1/products/#{meal.slug}", params: {location_id: donki.id}
    expect(response.parsed_body).to include("actually_available" => false)
    expect(response.parsed_body.fetch("variants")).to all(include("actually_available" => false))
    expect(pos_items(donki).sole).to include("location_available" => false)
  end

  it "prevents restore and legacy catalog writes from offering a non-carried item" do
    patch "/api/v1/admin/products/#{meal.id}/availability", params: {availability: {location_id: donki.id, available: true}}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(row.reload).to have_attributes(offered: false, available: true, price_override_cents: 900)
    get "/api/v1/admin/products/#{meal.id}"
    expect(response.parsed_body.fetch("data")).to include("offered_location_ids" => [main.id], "location_ids" => [main.id])
    row.update!(available: false)
    put "/api/v1/admin/products/#{meal.id}", params: {product: {location_ids: [main.id, donki.id]}}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(row.reload).to have_attributes(offered: false, available: false)
  end

  it "does not create membership from a missing row through legacy catalog daily flags" do
    row.destroy!
    put "/api/v1/admin/products/#{meal.id}", params: {product: {location_ids: [main.id, donki.id]}}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(meal.product_locations.where(location: donki)).to be_empty
    put "/api/v1/admin/products/#{meal.id}", params: {product: {location_ids: [main.id]}}, as: :json
    expect(response).to have_http_status(:ok)
    expect(meal.product_locations.find_by!(location: donki).offered).to be(false)
  end

  it "allows owners and global managers to change only membership, preserving daily state and price" do
    [create(:user, :owner), create(:user, :manager)].each do |allowed|
      allow_any_instance_of(Api::V1::Admin::ProductOfferingsController).to receive(:current_user).and_return(allowed)
      row.update_columns(offered: false, available: false)
      change_offering(true)
      expect(response).to have_http_status(:ok)
      expect(row.reload).to have_attributes(offered: true, available: false, price_override_cents: 900)
      change_offering(true)
      expect(response).to have_http_status(:ok)
    end
  end

  it "denies scoped managers, staff and customers membership changes" do
    [create(:user, :manager, assigned_location: donki), create(:user, :staff, assigned_location: donki), create(:user)].each do |denied|
      allow_any_instance_of(Api::V1::Admin::ProductOfferingsController).to receive(:current_user).and_return(denied)
      change_offering(true)
      expect(response).to have_http_status(:forbidden)
      expect(row.reload.offered).to be(false)
    end
  end

  it "rejects strings, smuggled daily flags and missing locations without writing" do
    change_offering("false")
    expect(response).to have_http_status(:unprocessable_entity)
    change_offering(true, available: true)
    expect(response).to have_http_status(:unprocessable_entity)
    patch path, params: {offering: {location_id: donki.id + main.id + 10000, offered: true}}, as: :json
    expect(response).to have_http_status(:not_found)
    ["invalid", {location_id: [donki.id], offered: true}].each do |invalid|
      patch path, params: {offering: invalid}, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(row.reload.offered).to be(false)
  end

  it "discloses capability and daily edit scope separately and materializes legacy all-location rows" do
    meal.product_locations.delete_all
    get path
    expect(response.parsed_body.fetch("data").fetch("locations")).to all(include("offered" => true, "available" => true))
    change_offering(false)
    expect(response).to have_http_status(:ok)
    expect(meal.product_locations.find_by!(location: main)).to have_attributes(offered: true, available: true)
    expect(meal.product_locations.find_by!(location: donki)).to have_attributes(offered: false, available: true)
  end

  it "uses Main as the explicit POS default rather than alphabetic order, otherwise the richest menu" do
    get "/api/v1/admin/pos/menu"
    expect(response.parsed_body.fetch("default_location_id")).to eq(main.id)
    main.update!(slug: "another-location")
    get "/api/v1/admin/pos/menu"
    expect(response.parsed_body.fetch("default_location_id")).to eq(main.id)
  end

  it "rejects forged POS and online checkout requests before reserving or calling providers" do
    configure_payment_fixture!
    expect(Payments::ProviderResolver).not_to receive(:for_identity)
    post "/api/v1/admin/pos/orders", params: {order: {location_id: donki.id, payment_method: "cash", items: [{product_variant_id: meal.product_variants.first.id, quantity: 1}]}}, headers: {"Idempotency-Key" => SecureRandom.uuid}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch("error")).to match(/not available|not offered/i)
    cart = CartItem.create!(session_id: SecureRandom.uuid, product_variant: meal.product_variants.first, quantity: 1)
    post "/api/v1/checkout_sessions", params: {order: {fulfillment_type: "pickup", location_id: donki.id, customer_name: "Fixture Guest", customer_phone: "6715550100", customer_email: "fictional@example.test"}}, headers: payment_headers(cart.session_id), as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch("error")).to match(/not available|not offered/i)
    expect(InventoryReservation.count).to eq(0)
    expect(PaymentAttempt.count).to eq(0)
  end
  it "retains captured evidence but does not fulfill after an offering is removed during checkout" do
    configure_payment_fixture!
    row.update!(offered: true)
    cart = CartItem.create!(session_id: SecureRandom.uuid, product_variant: meal.product_variants.first, quantity: 1)
    post "/api/v1/checkout_sessions", params: {order: {fulfillment_type: "pickup", location_id: donki.id,
      customer_name: "Fixture Guest", customer_phone: "6715550100", customer_email: "fictional@example.test"}}, headers: payment_headers(cart.session_id), as: :json
    expect(response).to have_http_status(:created), response.body
    state = response.parsed_body
    pending = Order.find(state.fetch("order").fetch("id"))
    expect(InventoryReservation.find_by!(order: pending).state).to eq("held")
    change_offering(false)
    expect(response).to have_http_status(:ok)
    post "/api/v1/checkout_sessions/#{state.fetch('id')}/confirm", headers: payment_headers(cart.session_id)
    expect(response).to have_http_status(:accepted), response.body
    expect(pending.reload.payment_status).to eq("pending")
    expect(pending.inventory_commitment_id).to be_nil
    expect(meal.reload.product_stock_quantity).to eq(5)
    attempt = PaymentAttempt.find(state.fetch("attempt_id"))
    expect(attempt.captured_cents).to eq(900)
    expect(attempt.state).to eq("compensation_required")
    expect(PaymentOutbox.where(kind: "compensate").count).to eq(1)
  end

end
