require "rails_helper"
require "tempfile"

RSpec.describe "Product CSV import", type: :request do
  let(:admin) { create(:user, :admin) }
  let(:controller) { Api::V1::Admin::ProductsController }

  def sign_in(user)
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(user)
  end

  def upload_csv(text)
    Tempfile.create([ "products", ".csv" ]) do |file|
      file.binmode
      file.write(text)
      file.flush
      post "/api/v1/admin/products/import_csv", params: {
        file: Rack::Test::UploadedFile.new(file.path, "text/csv")
      }
    end
  end

  it "requires authentication and rejects customers" do
    post "/api/v1/admin/products/import_csv"
    expect(response).to have_http_status(:unauthorized)
    sign_in(create(:user))
    upload_csv("name,price\nDenied,1.00\n")
    expect(response).to have_http_status(:forbidden)
    expect(Product.count).to eq(0)
  end

  it "requires an uploaded file" do
    sign_in(admin)
    post "/api/v1/admin/products/import_csv", params: { file: "not a file" }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  let!(:main_location) { Location.create!(name: "Three Squares Main", slug: "main") }
  let!(:donki_location) { Location.create!(name: "Three Squares @ Donki", slug: "donki") }

  it "imports exact cents, categories, default variants and active flags" do
    sign_in(admin)
    upload_csv("\uFEFFname,description,price,category_name,active,locations\nBeef Tapa,Tasty,12.99,Breakfast,true,main\nWater,,1.50,Breakfast,no,main\n")
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("data")).to include("imported" => 2, "skipped" => 0, "total" => 2, "notices" => [])
    product = Product.find_by!(name: "Beef Tapa")
    expect(product).to be_published
    expect(product.base_price_cents).to eq(1299)
    expect(product.product_variants.sole.price_cents).to eq(1299)
    expect(product).to be_allow_pickup
    expect(product).not_to be_allow_shipping
    expect(product.collections.sole.name).to eq("Breakfast")
    expect(Product.find_by!(name: "Water")).not_to be_published
    expect(Collection.count).to eq(1)
  end

  it "skips malformed, absent, negative, over-precision and overflowing prices without creating free items" do
    sign_in(admin)
    upload_csv("name,price\nBad,abc\nMissing,\nNegative,-1\nPrecision,1.234\nHuge,21474836.48\nFree,0.00\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 1, "skipped" => 5, "total" => 6)
    expect(data.fetch("errors").map { |error| error["row"] }).to eq([ 2, 3, 4, 5, 6 ])
    expect(Product.pluck(:name, :base_price_cents)).to eq([ [ "Free", 0 ] ])
  end

  it "skips missing names and invalid active flags" do
    sign_in(admin)
    upload_csv("name,price,active\n,1,true\nTypo,1,treu\n")
    expect(response.parsed_body.fetch("data")).to include("imported" => 0, "skipped" => 2)
    expect(Product.count).to eq(0)
  end

  it "reports duplicate products and continues with other rows" do
    sign_in(admin)
    create(:product, name: "Existing", slug: "existing")
    upload_csv("name,price\nExisting,2.00\nNew Meal,9.99\n")
    expect(response.parsed_body.fetch("data")).to include("imported" => 1, "skipped" => 1)
    expect(Product.find_by!(name: "New Meal").base_price_cents).to eq(999)
  end

  it "rolls back the product and variant when category creation fails, then continues" do
    sign_in(admin)
    create(:collection, name: "Lunch!", slug: "lunch")
    upload_csv("name,price,category_name\nRollback Meal,3.00,Lunch\nGood Meal,4.00,\n")
    expect(response.parsed_body.fetch("data")).to include("imported" => 1, "skipped" => 1)
    expect(Product.exists?(name: "Rollback Meal")).to be(false)
    expect(ProductVariant.count).to eq(1)
    expect(Product.sole.name).to eq("Good Meal")
  end

  [ "name,cost\nMeal,1\n", "name,price,price\nMeal,1,2\n", "name,price\n", "name,price\n\"unclosed" ].each do |text|
    it "rejects invalid headers, empty data or malformed CSV: #{text.inspect}" do
      sign_in(admin)
      upload_csv(text)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(Product.count).to eq(0)
    end
  end

  it "rejects invalid UTF-8 and oversized uploads" do
    sign_in(admin)
    upload_csv("name,price\n\xFF,1\n".b)
    expect(response).to have_http_status(:unprocessable_entity)
    upload_csv("a" * (2.megabytes + 1))
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "rejects too many rows before creating any product" do
    sign_in(admin)
    upload_csv("name,price\n" + ("Meal,1\n" * 2001))
    expect(response).to have_http_status(:unprocessable_entity)
    expect(Product.count).to eq(0)
  end

  it "assigns pickup locations by slug or name and limits availability to them" do
    sign_in(admin)
    upload_csv("name,price,locations\nDonki Bowl,9.50,Three Squares @ Donki\nShared Plate,11.00,main; DONKI\n")
    expect(response.parsed_body.fetch("data")).to include("imported" => 2, "skipped" => 0)
    donki_only = Product.find_by!(name: "Donki Bowl")
    expect(donki_only).to be_published
    expect(donki_only.available_for_location?(donki_location.id)).to be(true)
    expect(donki_only.available_for_location?(main_location.id)).to be(false)
    shared = Product.find_by!(name: "Shared Plate")
    expect(shared.product_locations.available.pluck(:location_id)).to contain_exactly(main_location.id, donki_location.id)
  end

  it "imports rows without locations as unpublished drafts with a notice" do
    sign_in(admin)
    upload_csv("name,price,active\nNo Location,5.00,true\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 1, "skipped" => 0)
    expect(data.fetch("notices").sole).to include("row" => 2, "name" => "No Location")
    product = Product.find_by!(name: "No Location")
    expect(product).not_to be_published
    expect(product.product_locations.pluck(:location_id, :available)).to match_array([ [ main_location.id, false ], [ donki_location.id, false ] ])
    expect(data.fetch("created").sole).to include("row" => 2, "product_id" => product.id, "published" => false, "needs_pickup_locations" => true)
    get "/api/v1/admin/products/#{product.id}"
    expect(response.parsed_body.fetch("data")).to include("location_ids" => [], "needs_pickup_locations" => true)
  end

  it "skips rows with unknown locations without creating them" do
    sign_in(admin)
    upload_csv("name,price,locations\nGhost,5.00,main;tumon\nReal,6.00,main\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 1, "skipped" => 1)
    expect(data.fetch("errors").sole).to include("row" => 2, "error" => "Unknown or ambiguous location: tumon. Use the location slug.")
    expect(Product.pluck(:name)).to eq([ "Real" ])
  end

  it "skips rows containing null characters and still reports counts" do
    sign_in(admin)
    upload_csv("name,price,category_name,locations\nGood,5.00,Lunch,main\nBad,6.00,Lun\u0000ch,main\nAlso Good,7.00,,main\n")
    expect(response).to have_http_status(:ok)
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 2, "skipped" => 1, "total" => 3)
    expect(data.fetch("errors").sole).to include("row" => 3, "error" => "Row contains an invalid null character")
    expect(Collection.pluck(:name)).to eq([ "Lunch" ])
  end

  it "prefers slugs over names and rejects names shared by several locations" do
    sign_in(admin)
    named_main = Location.create!(name: "main", slug: "other-site")
    Location.create!(name: "Pop-Up", slug: "pop-up-a")
    Location.create!(name: "Pop-Up", slug: "pop-up-b")
    upload_csv("name,price,locations\nBy Slug,5.00,main\nBy Name,6.00,Three Squares Main\nAmbiguous,7.00,pop-up\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 2, "skipped" => 1)
    expect(data.fetch("errors").sole).to include("row" => 4, "name" => "Ambiguous")
    by_slug = Product.find_by!(name: "By Slug")
    expect(by_slug.product_locations.available.pluck(:location_id)).to eq([ main_location.id ])
    expect(by_slug.available_for_location?(named_main.id)).to be(false)
    expect(Product.find_by!(name: "By Name").product_locations.available.pluck(:location_id)).to eq([ main_location.id ])
  end

  it "skips rows with null characters in name, description or price" do
    sign_in(admin)
    upload_csv("name,description,price,locations\nNa\u0000me,Tasty,5.00,main\nOkay,Ta\u0000sty,5.00,main\nPricey,Tasty,5.0\u00000,main\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 0, "skipped" => 3, "total" => 3)
    expect(data.fetch("errors").map { |error| error["error"] }.uniq).to eq([ "Row contains an invalid null character" ])
    expect(Product.count).to eq(0)
  end

  it "uses an exact slug and rejects slugs that only differ by case" do
    sign_in(admin)
    upper = Location.create!(name: "Upper Site", slug: "MAIN")
    upload_csv("name,price,locations\nExact Lower,5.00,main\nExact Upper,6.00,MAIN\nFolded,7.00,Main\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 2, "skipped" => 1)
    expect(data.fetch("errors").sole).to include("row" => 4, "name" => "Folded")
    expect(Product.find_by!(name: "Exact Lower").product_locations.available.pluck(:location_id)).to eq([ main_location.id ])
    expect(Product.find_by!(name: "Exact Upper").product_locations.available.pluck(:location_id)).to eq([ upper.id ])
  end
  it "returns exact committed product identities, including intentionally inactive unassigned drafts" do
    sign_in(admin)
    upload_csv("name,price,active,locations\nInactive draft,5.00,false,\nPublished meal,12.00,true,main\nInvalid row,not-a-price,true,main\n")
    data = response.parsed_body.fetch("data")
    inactive = Product.find_by!(name: "Inactive draft")
    published = Product.find_by!(name: "Published meal")
    expect(data.fetch("created")).to contain_exactly(
      include("row" => 2, "product_id" => inactive.id, "published" => false, "needs_pickup_locations" => true),
      include("row" => 3, "product_id" => published.id, "published" => true, "needs_pickup_locations" => false)
    )
    expect(data.fetch("notices").sole).to include("row" => 2, "product_id" => inactive.id)
    expect(data.fetch("errors").sole).to include("row" => 4)
    expect(data.fetch("errors").sole).not_to have_key("product_id")
    expect(inactive.product_locations.available).to be_empty
    allow_any_instance_of(Api::V1::Admin::ProductOfferingsController).to receive(:current_user).and_return(admin)
    patch "/api/v1/admin/products/#{inactive.id}/offerings", params: { offering: { location_id: main_location.id, offered: true } }, as: :json
    expect(response).to have_http_status(:ok)
    patch "/api/v1/admin/products/#{inactive.id}/availability", params: { availability: { location_id: main_location.id, available: true } }, as: :json
    expect(response).to have_http_status(:ok)
    get "/api/v1/admin/products/#{inactive.id}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("data")).to include("needs_pickup_locations" => false, "published" => false, "location_ids" => [ main_location.id ])
  end

  it "never adds a rolled-back row to the committed receipt" do
    sign_in(admin)
    create(:collection, name: "Lunch!", slug: "lunch")
    upload_csv("name,price,category_name,locations\nRollback Meal,3.00,Lunch,main\nGood Meal,4.00,,main\n")
    data = response.parsed_body.fetch("data")
    expect(data.fetch("created").sole).to include("row" => 3, "product_id" => Product.find_by!(name: "Good Meal").id)
    expect(Product.exists?(name: "Rollback Meal")).to be(false)
  end

  it "preserves legacy implicit-global drafts while reporting explicit unassigned drafts" do
    sign_in(admin)
    legacy = create(:product, published: false, allow_pickup: true)
    get "/api/v1/admin/products/#{legacy.id}"
    expect(response.parsed_body.fetch("data")).to include("location_ids" => match_array([ main_location.id, donki_location.id ]), "needs_pickup_locations" => false)
  end

  it "keeps scoped manager location authorization and independent row rollback" do
    sign_in(create(:user, :manager, assigned_location: main_location))
    upload_csv("name,price,category_name,active,locations\nMain meal,12.00,Lunch,true,main\nForeign meal,13.00,Foreign category,true,donki\nUnassigned draft,5.00,,false,\n")
    data = response.parsed_body.fetch("data")
    expect(data).to include("imported" => 2, "skipped" => 1)
    expect(data.fetch("errors").sole).to include("row" => 3, "error" => include("outside your authorized locations"))
    expect(Product.exists?(name: "Foreign meal")).to be(false)
    expect(Collection.exists?(name: "Foreign category")).to be(false)
    expect(Product.find_by!(name: "Main meal").product_locations.available.pluck(:location_id)).to eq([ main_location.id ])
    draft = Product.find_by!(name: "Unassigned draft")
    expect(draft).not_to be_published
    expect(draft.product_locations).not_to be_empty
    expect(draft.product_locations.available).to be_empty
    expect(data.fetch("created").map { |row| row.fetch("product_id") }).to match_array(Product.pluck(:id))
  end

  it "denies assigned counter staff the menu import operation" do
    sign_in(create(:user, :staff, assigned_location: main_location))
    upload_csv("name,price,locations\nDenied meal,12.00,main\n")
    expect(response).to have_http_status(:forbidden)
    expect(Product.count).to eq(0)
  end
end
