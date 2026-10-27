require "rails_helper"

RSpec.describe Location, type: :model do
  describe "#accepting_orders_at?" do
    let(:location) do
      Location.create!(
        name: "Main Store",
        slug: "main-store",
        active: true,
        hours_json: {
          "Monday" => "8:00 AM - 5:00 PM",
          "Tuesday" => "Closed"
        }
      )
    end

    it "returns true when no hours are configured" do
      always_open = Location.create!(name: "Always Open", slug: "always-open", active: true, hours_json: {})

      expect(always_open.accepting_orders_at?(Time.zone.parse("2026-04-27 09:00"))).to be(true)
    end

    it "returns true during an open pickup window" do
      expect(location.accepting_orders_at?(Time.zone.parse("2026-04-27 09:00"))).to be(true)
    end

    it "returns false outside the configured pickup window" do
      expect(location.accepting_orders_at?(Time.zone.parse("2026-04-27 18:00"))).to be(false)
    end

    it "returns false when the day is marked closed" do
      expect(location.accepting_orders_at?(Time.zone.parse("2026-04-28 10:00"))).to be(false)
    end
  end
end
