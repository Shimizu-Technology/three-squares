require "rails_helper"

RSpec.describe "Admin seasonal collections", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:admin) { create(:user, :admin) }
  let(:attributes) do
    { name: "Christmas menu", collection_type: "seasonal", starts_at: "2026-12-25T00:00:00+10:00",
      ends_at: "2026-12-26T00:00:00+10:00", auto_hide: true, is_featured: true, banner_text: "Holiday specials", published: true }
  end

  before do
    controller = Api::V1::Admin::CollectionsController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
  end

  it "persists seasonal attributes, round trips Guam offsets, and exposes upcoming status to admins" do
    travel_to(Time.zone.parse("2026-12-24 00:00:00")) do
      post "/api/v1/admin/collections", params: { collection: attributes }, as: :json
      expect(response).to have_http_status(:created)
      row = response.parsed_body.fetch("data")
      expect(row).to include(attributes.stringify_keys.except("published").merge("featured" => true,
        "available" => false, "availability_status" => "upcoming"))
      collection = Collection.find(row.fetch("id"))
      expect(collection.starts_at.utc.iso8601).to eq("2026-12-24T14:00:00Z")
      expect(collection.is_featured).to be(true)
      get "/api/v1/admin/collections/#{collection.id}"
      expect(response.parsed_body.dig("data", "starts_at")).to eq(attributes[:starts_at])
      patch "/api/v1/admin/collections/#{collection.id}", params: { collection: { starts_at: nil, ends_at: nil, is_featured: false } }, as: :json
      expect(response).to have_http_status(:ok)
      expect(collection.reload.starts_at).to be_nil
      expect(collection.ends_at).to be_nil
      expect(collection.featured).to be(false)
    end
  end

  it "makes featured canonical when both aliases are supplied, including an unchanged value" do
    collection = create(:collection, featured: false)
    patch "/api/v1/admin/collections/#{collection.id}", params: { collection: { featured: false, is_featured: true } }, as: :json
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("data")).to include("featured" => false, "is_featured" => false)
    expect(collection.reload.is_featured).to be(false)
  end

  it "rejects invalid seasonal input without saving" do
    [{ ends_at: attributes[:starts_at] }, { ends_at: "2026-12-24T00:00:00+10:00" },
      { starts_at: "nonsense" }, { ends_at: "nonsense" }, { starts_at: "2026-02-30T00:00:00+10:00" },
      { collection_type: "popup" }, { auto_hide: nil }, { banner_text: "x" * 201 }].each do |invalid|
      expect do
        post "/api/v1/admin/collections", params: { collection: attributes.merge(invalid) }, as: :json
      end.not_to change(Collection, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.fetch("errors")).not_to be_empty
    end
  end
end
