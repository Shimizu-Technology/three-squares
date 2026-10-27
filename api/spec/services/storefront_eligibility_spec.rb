require "rails_helper"

RSpec.describe StorefrontEligibility do
  let(:settings) { SiteSetting.instance }
  let!(:main) { create(:product) }
  let!(:cookie) { create(:product) }
  let!(:catering) { create(:product) }
  let!(:mixed) { create(:product) }

  before do
    cookies = create(:collection, slug: "cookies")
    trays = create(:collection, slug: "catering-trays")
    cookie.collections << cookies
    catering.collections << trays
    mixed.collections << [cookies, trays]
  end

  it "classifies cookies first, then catering, with unclassified products in Three Squares" do
    expect([main, cookie, catering, mixed].map { |product| described_class.key_for(product) })
      .to eq(%w[three_squares latte_stone catering latte_stone])
  end

  it "uses the same eligibility for records and database scopes for every flag combination" do
    [true, false].repeated_permutation(3).each do |flags|
      settings.update!(described_class::SETTINGS.values.zip(flags).to_h)
      expected = [main, cookie, catering, mixed].select { |product| described_class.enabled?(product, settings: settings) }.map(&:id)
      expect(described_class.scope(Product.all, settings: settings).pluck(:id)).to match_array(expected)
    end
  end
end
