require "rails_helper"

RSpec.describe "Admin menu membership", type: :request do
  let(:actor) { create(:user, :owner) }
  let(:menu) { create(:collection, collection_type: "seasonal", starts_at: 2.days.from_now, ends_at: 3.days.from_now) }
  let!(:first) { create(:product, published: true) }
  let!(:second) { create(:product, published: false) }

  before do
    allow_any_instance_of(Api::V1::Admin::CollectionsController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::CollectionsController).to receive(:current_user).and_return(actor)
  end

  it "saves schedule and ordered membership together and previews unpublished items only to admins" do
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { name: "Thanksgiving meals", product_ids: [ second.id, first.id ] } }, as: :json
    expect(response).to have_http_status(:ok)
    row = response.parsed_body.fetch("data")
    expect(row).to include("name" => "Thanksgiving meals", "product_count" => 2, "availability_status" => "upcoming", "available" => false)
    expect(row.fetch("products").map { |p| p.fetch("id") }).to eq([ second.id, first.id ])
    expect(menu.product_collections.order(:position).pluck(:product_id, :position)).to eq([ [ second.id, 0 ], [ first.id, 1 ] ])
    get "/api/v1/collections/#{menu.slug}"
    expect(response).to have_http_status(:not_found)
    expect(second.reload.published).to be(false)
  end

  it "retains membership when metadata alone is saved and permits explicit empty selection" do
    menu.product_collections.create!(product: first, position: 3)
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { description: "Notes only" } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(menu.reload.products.pluck(:id)).to eq([ first.id ])
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { product_ids: [] } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(menu.reload.products).to be_empty
    expect(first.reload).to be_persisted
  end

  it "rejects malformed membership atomically without changing the schedule or creating menus" do
    menu.product_collections.create!(product: first, position: 0)
    [ [ first.id, first.id ], [ first.id, 99999999 ], [ 0 ], [ "bad" ], first.id, nil ].each do |ids|
      patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { name: "Must not save", product_ids: ids } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(menu.reload.name).not_to eq("Must not save")
      expect(menu.products.pluck(:id)).to eq([ first.id ])
      expect do
        post "/api/v1/admin/collections", params: { collection: { name: "Invalid menu", product_ids: ids } }, as: :json
      end.not_to change(Collection, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  it "rolls membership back when schedule validation fails and saves new menus with items" do
    menu.product_collections.create!(product: first, position: 0)
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { ends_at: 1.day.ago.iso8601, product_ids: [ second.id ] } }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(menu.reload.products.pluck(:id)).to eq([ first.id ])
    post "/api/v1/admin/collections", params: { collection: { name: "Weekend lunch", product_ids: [ first.id, second.id ] } }, as: :json
    expect(response).to have_http_status(:created)
    expect(response.parsed_body.dig("data", "products").map { |p| p.fetch("id") }).to eq([ first.id, second.id ])
  end

  it "allows assigned managers catalog work while denying staff direct membership writes and previews" do
    manager = create(:user, :manager, assigned_location: create(:location))
    allow_any_instance_of(Api::V1::Admin::CollectionsController).to receive(:current_user).and_return(manager)
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { product_ids: [ first.id ] } }, as: :json
    expect(response).to have_http_status(:ok)
    allow_any_instance_of(Api::V1::Admin::CollectionsController).to receive(:current_user).and_return(create(:user, :staff, assigned_location: manager.assigned_location))
    get "/api/v1/admin/collections/#{menu.id}"
    expect(response).to have_http_status(:forbidden)
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { product_ids: [] } }, as: :json
    expect(response).to have_http_status(:forbidden)
    expect(menu.reload.products.pluck(:id)).to eq([ first.id ])
  end

  it "uses saved item order on public location-filtered pages without making draft or upcoming menus orderable" do
    location = create(:location)
    SiteSetting.instance.update!(enable_storefront_three_squares: true)
    menu.update!(starts_at: 1.day.ago, ends_at: 1.day.from_now)
    second.update!(published: true)
    [ first, second ].each { |p| p.product_locations.create!(location: location, available: true) }
    menu.product_collections.create!(product: second, position: 0)
    menu.product_collections.create!(product: first, position: 1)
    get "/api/v1/collections/#{menu.slug}", params: { location_id: location.id, per_page: 1 }
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("products").map { |p| p.fetch("id") }).to eq([ second.id ])
    expect(response.parsed_body.dig("meta", "total")).to eq(2)
    get "/api/v1/collections/#{menu.slug}", params: { location_id: location.id, per_page: 1, page: 2 }
    expect(response.parsed_body.fetch("products").map { |p| p.fetch("id") }).to eq([ first.id ])
    menu.update!(starts_at: 2.days.from_now, ends_at: 3.days.from_now)
    get "/api/v1/collections/#{menu.slug}", params: { location_id: location.id }
    expect(response).to have_http_status(:not_found)
  end

  it "batches membership writes and leaves unchanged links and original creation times intact" do
    extra = create_list(:product, 5)
    original = [ first, second, *extra ]
    original.each_with_index { |product, position| menu.product_collections.create!(product: product, position: position) }
    retained = menu.product_collections.find_by!(product: first)
    created_at = retained.created_at
    counts = []
    [ original.map(&:id).reverse, original.map(&:id) ].each do |ids|
      writes = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |_name, _start, _finish, _id, payload|
        sql = payload[:sql]
        writes << sql if sql.match?(/\A(?:INSERT INTO|UPDATE|DELETE FROM) "product_collections"/)
      end
      begin
        patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { product_ids: ids } }, as: :json
      ensure
        ActiveSupport::Notifications.unsubscribe(subscriber)
      end
      expect(response).to have_http_status(:ok)
      expect(menu.product_collections.order(:position).pluck(:product_id)).to eq(ids)
      counts << writes.size
    end
    expect(counts).to all(be <= 3)
    expect(retained.reload.created_at).to eq(created_at)
    timestamp = retained.updated_at
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { description: "No item changes", product_ids: original.map(&:id) } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(retained.reload.updated_at).to eq(timestamp)
    addition = create(:product)
    patch "/api/v1/admin/collections/#{menu.id}", params: { collection: { product_ids: [ addition.id, first.id ] } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(menu.product_collections.order(:position).pluck(:product_id)).to eq([ addition.id, first.id ])
  end
end
