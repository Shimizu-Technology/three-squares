require "rails_helper"

RSpec.describe "Seasonal menu public APIs", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:at) { Time.zone.parse("2026-12-25 00:00:00") }
  let!(:regular) { create(:collection, name: "Regular") }
  let!(:upcoming) { create(:collection, starts_at: at + 1.hour, collection_type: "seasonal") }
  let!(:current) { create(:collection, starts_at: at, ends_at: at + 1.hour, collection_type: "event", banner_text: "Holiday specials") }
  let!(:hidden_expired) { create(:collection, ends_at: at, auto_hide: true, collection_type: "limited_time") }
  let!(:retained_expired) { create(:collection, ends_at: at, auto_hide: false, collection_type: "seasonal") }
  let!(:unpublished) { create(:collection, collection_type: "seasonal", published: false) }
  let!(:plain_product) { create(:product, collections: [regular]) }
  let!(:upcoming_product) { create(:product, collections: [upcoming]) }
  let!(:current_product) { create(:product, collections: [current]) }
  let!(:hidden_product) { create(:product, collections: [hidden_expired]) }
  let!(:retained_product) { create(:product, collections: [retained_expired]) }
  let!(:unpublished_product) { create(:product, collections: [unpublished]) }
  let!(:shared_product) { create(:product, collections: [regular, upcoming, retained_expired]) }

  around { |example| travel_to(at) { example.run } }

  def ids(key)
    response.parsed_body.fetch(key).map { |row| row.fetch("id") }
  end

  it "lists visible collections and returns consistent direct ID/slug visibility and ISO offsets" do
    get "/api/v1/collections"
    expect(ids("collections")).to match_array([regular.id, current.id, retained_expired.id])
    row = response.parsed_body.fetch("collections").find { |c| c.fetch("id") == current.id }
    expect(row).to include("starts_at" => "2026-12-25T00:00:00+10:00", "ends_at" => "2026-12-25T01:00:00+10:00",
      "collection_type" => "event", "banner_text" => "Holiday specials", "auto_hide" => false,
      "available" => true, "availability_status" => "active", "is_featured" => false)

    [upcoming, hidden_expired, unpublished].each do |collection|
      [collection.id, collection.slug].each do |identifier|
        get "/api/v1/collections/#{identifier}"
        expect(response).to have_http_status(:not_found)
      end
    end
    get "/api/v1/collections/#{current.slug}"
    expect(response).to have_http_status(:ok)
    expect(ids("products")).to eq([current_product.id])
  end

  it "retains ended menus with explicit unavailable state and no products, count or thumbnail, including shared products" do
    create(:product_image, product: retained_product, url: "https://example.com/expired.jpg")
    create(:product_image, product: shared_product, url: "https://example.com/shared.jpg")
    get "/api/v1/collections/#{retained_expired.slug}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("collection")).to include("available" => false, "availability_status" => "ended",
      "product_count" => 0, "thumbnail_url" => nil)
    expect(response.parsed_body.fetch("products")).to eq([])
    expect(response.parsed_body.dig("meta", "total")).to eq(0)

    get "/api/v1/collections"
    expect(response.parsed_body.fetch("collections").find { |c| c.fetch("id") == retained_expired.id })
      .to include("available" => false, "product_count" => 0, "thumbnail_url" => nil)
  end

  it "combines storefront and menu rules in product listing, types, direct IDs/slugs and memberships" do
    cookies = create(:collection, slug: "cookies")
    cookie = create(:product, collections: [cookies, current], product_type: "cookies")
    SiteSetting.instance.update!(enable_storefront_latte_stone: false)
    upcoming_product.update!(product_type: "upcoming-only")
    get "/api/v1/products"
    expect(ids("products")).to match_array([plain_product.id, current_product.id, shared_product.id])
    expect(response.parsed_body.dig("meta", "total")).to eq(3)
    expect(response.parsed_body.dig("meta", "product_types")).to eq(["apparel"])
    shared_row = response.parsed_body.fetch("products").find { |row| row.fetch("id") == shared_product.id }
    expect(shared_row.fetch("collections").map { |c| c.fetch("id") }).to match_array([regular.id, retained_expired.id])

    [upcoming_product, hidden_product, retained_product, unpublished_product, cookie].each do |product|
      [product.id, product.slug].each do |identifier|
        get "/api/v1/products/#{identifier}"
        expect(response).to have_http_status(:not_found)
      end
    end
    get "/api/v1/products/#{shared_product.slug}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("collections").map { |c| c.fetch("id") }).to match_array([regular.id, retained_expired.id])
  end

  it "rejects unpublished regular fallbacks and filters disabled-storefront products from collection counts and thumbnails" do
    # This regular association is unpublished, so it cannot keep exclusives orderable.
    regular.update!(published: false)
    [upcoming_product, hidden_product, retained_product].each { |p| p.collections << regular }
    get "/api/v1/products"
    expect(ids("products")).to match_array([plain_product.id, current_product.id])

    # A visible active special may contain a storefront-disabled shared product.
    cookies = create(:collection, slug: "cookies")
    cookie = create(:product, collections: [cookies, current])
    create(:product_image, product: cookie, url: "https://example.com/disabled.jpg")
    create(:product_image, product: current_product, url: "https://example.com/current.jpg")
    SiteSetting.instance.update!(enable_storefront_latte_stone: false)
    get "/api/v1/collections/#{current.slug}"
    expect(ids("products")).to eq([current_product.id])
    expect(response.parsed_body.fetch("collection")).to include("product_count" => 1, "thumbnail_url" => "https://example.com/current.jpg")
  end

  it "respects collection filters for upcoming, unpublished and expired menus even for shared products" do
    [upcoming, hidden_expired, retained_expired, unpublished].each do |collection|
      [{ collection: collection.slug }, { collection_id: collection.id }].each do |filter|
        get "/api/v1/products", params: filter
        expect(response).to have_http_status(:ok)
        expect(ids("products")).to eq([])
      end
    end
  end

  it "changes catalog availability at boundaries without changing publication and follows republishing" do
    travel_to(at + 1.hour)
    get "/api/v1/products/#{current_product.id}"
    expect(response).to have_http_status(:not_found)
    get "/api/v1/products/#{upcoming_product.id}"
    expect(response).to have_http_status(:ok)
    get "/api/v1/collections/#{current.id}"
    expect(response.parsed_body.fetch("collection")).to include("available" => false, "availability_status" => "ended")
    travel_to(at)
    expect(current.reload).to be_published
    current.update!(published: false)
    get "/api/v1/collections/#{current.slug}"
    expect(response).to have_http_status(:not_found)
    current.update!(published: true)
    get "/api/v1/collections/#{current.slug}"
    expect(response.parsed_body.dig("collection", "available")).to be(true)
  end
end
