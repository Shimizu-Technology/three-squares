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
    Tempfile.create(["products", ".csv"]) do |file|
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

  it "imports exact cents, categories, default variants and active flags" do
    sign_in(admin)
    upload_csv("\uFEFFname,description,price,category_name,active\nBeef Tapa,Tasty,12.99,Breakfast,true\nWater,,1.50,Breakfast,no\n")
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("data")).to include("imported" => 2, "skipped" => 0, "total" => 2)
    product = Product.find_by!(name: "Beef Tapa")
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
    expect(data.fetch("errors").map { |error| error["row"] }).to eq([2, 3, 4, 5, 6])
    expect(Product.pluck(:name, :base_price_cents)).to eq([["Free", 0]])
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

  ["name,cost\nMeal,1\n", "name,price,price\nMeal,1,2\n", "name,price\n", "name,price\n\"unclosed"].each do |text|
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
end
