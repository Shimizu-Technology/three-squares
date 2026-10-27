require "rails_helper"

RSpec.describe "Public pickup schedule", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  it "expands legacy Daily hours for editing and publishes current Guam availability" do
    location = Location.create!(name: "Donki", slug: "donki")
    location.update_columns(hours_json: { "Daily" => "10am - 10pm" })
    travel_to(Time.utc(2026, 10, 27, 13)) do
      get "/api/v1/locations"
      row = response.parsed_body.fetch("locations").find { |entry| entry.fetch("id") == location.id }
      expect(row.fetch("hours_json").keys.sort).to eq(Date::DAYNAMES.sort)
      expect(row.fetch("accepting_orders_now")).to be(false)
    end
  end
end
