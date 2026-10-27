require 'rails_helper'

RSpec.describe Collection, type: :model do
  describe 'validations' do
    it 'is valid with factory defaults' do
      expect(build(:collection)).to be_valid
    end

    it 'requires unique slug' do
      create(:collection, slug: 'tees')
      duplicate = build(:collection, slug: 'tees')

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:slug]).to include('has already been taken')
    end

    it 'enforces slug format' do
      collection = build(:collection, slug: 'Invalid Slug')

      expect(collection).not_to be_valid
      expect(collection.errors[:slug]).to include('is invalid')
    end
  end

  describe 'callbacks and helpers' do
    it 'generates slug when missing' do
      collection = Collection.create!(name: 'Summer Collection', slug: nil)

      expect(collection.slug).to eq('summer-collection')
      expect(collection.to_param).to eq('summer-collection')
    end
  end

  describe 'scopes' do
    it 'filters published, featured, and ordered collections' do
      featured = create(:collection, published: true, featured: true, sort_order: 1, name: 'A')
      published_only = create(:collection, published: true, featured: false, sort_order: 2, name: 'B')
      unpublished = create(:collection, published: false, featured: false, sort_order: 0, name: 'C')

      expect(described_class.published).to include(featured, published_only)
      expect(described_class.featured).to include(featured)
      expect(described_class.by_position.to_a).to eq([unpublished, featured, published_only])
    end
  end

  describe "scheduled menus" do
    let(:start) { Time.zone.parse("2026-12-25 00:00:00") }

    it "uses Guam midnight (the previous UTC date) with inclusive start and exclusive end" do
      expect(Time.zone.name).to eq("Pacific/Guam")
      expect(start.utc.iso8601).to eq("2026-12-24T14:00:00Z")
      collection = create(:collection, collection_type: "seasonal", starts_at: start, ends_at: start + 1.hour)
      expect(collection.ordering_available?(at: start - 1.second)).to be(false)
      expect(collection.ordering_available?(at: start)).to be(true)
      expect(collection.ordering_available?(at: start + 1.hour - 1.second)).to be(true)
      expect(collection.ordering_available?(at: start + 1.hour)).to be(false)
    end

    it "keeps visibility and ordering SQL consistent with record helpers through expiry/publication" do
      [true, false].repeated_permutation(2).each do |published, auto_hide|
        collection = create(:collection, starts_at: start, ends_at: start + 1.hour, published: published, auto_hide: auto_hide)
        [start - 1.second, start, start + 1.hour].each do |at|
          expect(Collection.visible_at(at).exists?(collection.id)).to eq(collection.visible?(at: at))
          expect(Collection.ordering_at(at).exists?(collection.id)).to eq(collection.ordering_available?(at: at))
        end
      end
    end

    it "validates type, banner bounds, strict dates and parsable datetime input" do
      Collection::COLLECTION_TYPES.each { |type| expect(build(:collection, collection_type: type)).to be_valid }
      [nil, "popup", ""].each { |type| expect(build(:collection, collection_type: type)).not_to be_valid }
      expect(build(:collection, banner_text: "a" * 200)).to be_valid
      expect(build(:collection, banner_text: "a" * 201)).not_to be_valid
      [start, start - 1.second].each do |ending|
        expect(build(:collection, starts_at: start, ends_at: ending)).not_to be_valid
      end
      %i[starts_at ends_at].each do |field|
        ["invalid date", "2026-02-30T00:00:00+10:00", "2026-12-25T25:00:00+10:00"].each do |invalid|
          expect(build(:collection, field => invalid)).not_to be_valid
        end
      end
      expect(build(:collection, starts_at: "", ends_at: nil)).to be_valid
      expect(build(:collection, starts_at: nil, ends_at: start)).to be_valid
      expect(build(:collection, starts_at: start, ends_at: nil)).to be_valid
      expect(build(:collection, starts_at: "2026-12-25T00:00:00")).to be_valid
      expect(build(:collection, starts_at: "2026-12-25T00:00:00").starts_at).to eq(start)
    end

    it "retains the existing featured scope and synchronizes the seasonal alias on writes" do
      collection = Collection.create!(name: "Special", is_featured: true)
      expect(collection.reload.featured).to be(true)
      expect(Collection.featured).to include(collection)
      collection.update!(featured: false)
      expect(collection.reload.is_featured).to be(false)
    end
  end
end
