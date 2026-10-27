require "rails_helper"

RSpec.describe LocationSchedule do
  let(:zone) { Time.find_zone!("Pacific/Guam") }
  let(:main_hours) do
    { "Tuesday - Saturday" => "8:00 AM - 8:00 PM", "Sunday" => "8am - 5pm", "Monday" => "Closed" }
  end

  it "normalizes the grouped restaurant seed into exactly seven validated days" do
    normalized = described_class.normalize(main_hours)
    expect(normalized.keys).to eq(Date::DAYNAMES)
    expect(normalized.fetch("Tuesday")).to eq("08:00 - 20:00")
    expect(normalized.fetch("Monday")).to eq("Closed")
    (25..31).each { |day| expect(described_class.open_at?(main_hours, zone.local(2026, 10, day, 23))).to be(false) }
  end

  it "enforces opening-inclusive and closing-exclusive boundaries and Guam weekdays" do
    expect(described_class.open_at?(main_hours, Time.utc(2026, 10, 26, 22))).to be(true) # Tuesday 08:00
    expect(described_class.open_at?(main_hours, zone.local(2026, 10, 27, 7, 59))).to be(false)
    expect(described_class.open_at?(main_hours, zone.local(2026, 10, 27, 20))).to be(false)
    expect(described_class.open_at?(main_hours, zone.local(2026, 10, 25, 16, 59))).to be(true)
    expect(described_class.open_at?(main_hours, zone.local(2026, 10, 25, 17))).to be(false)
    expect(described_class.open_at?(main_hours, zone.local(2026, 10, 26, 12))).to be(false)
  end

  it "expands Daily and allows explicit days to override it independently of input order" do
    hours = { "Monday" => "Closed", "Daily" => "10am - 10pm" }
    expect(described_class.normalize(hours).size).to eq(7)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 27, 10))).to be(true)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 27, 22))).to be(false)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 26, 12))).to be(false)
  end

  it "rejects incomplete, unknown, conflicting and malformed schedules and fails closed on legacy bad data" do
    [{ "Tuesday" => "8am - 8pm" }, { "Daily" => "25:00 - 26:00" }, { "Daily" => "9am - 9am" },
     { "Daily" => "open" }, { "Funday" => "8am - 8pm" },
     { "Daily" => "8am - 8pm", "MON" => "Closed", "Monday" => "9am - 5pm" }].each do |hours|
      expect { described_class.normalize(hours) }.to raise_error(ArgumentError)
      expect(described_class.open_at?(hours, zone.local(2026, 10, 27, 12))).to be(false)
    end
    expect(described_class.open_at?({}, zone.local(2026, 10, 27, 12))).to be(false)
  end

  it "attributes overnight hours to the preceding day's opening" do
    hours = { "Daily" => "Closed", "Monday" => "10pm - 2am" }
    expect(described_class.open_at?(hours, zone.local(2026, 10, 26, 23))).to be(true)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 27, 1))).to be(true)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 27, 2))).to be(false)
    expect(described_class.open_at?(hours, zone.local(2026, 10, 26, 1))).to be(false)
  end

  it "validates and saves canonical location hours, and never accepts inactive locations" do
    location = Location.create!(name: "Main", slug: "main", hours_json: main_hours)
    expect(location.reload.hours_json.keys.sort).to eq(Date::DAYNAMES.sort)
    expect(location.accepting_orders_at?(zone.local(2026, 10, 27, 12))).to be(true)
    location.update!(active: false)
    expect(location.accepting_orders_at?(zone.local(2026, 10, 27, 12))).to be(false)
    expect(location.update(hours_json: { "Daily" => "8am - 99pm" })).to be(false)
    expect(location.errors[:hours_json]).not_to be_empty
  end

  it "allows deactivation and unrelated changes when legacy hours are malformed" do
    location = Location.create!(name: "Legacy", slug: "legacy")
    location.update_columns(hours_json: { "Daily" => "bad legacy hours" })
    expect(location.update(active: false, phone: "671-646-2652")).to be(true)
    expect(location.normalized_hours.values.uniq).to eq(["Closed"])
    expect(location.accepting_orders_now?).to be(false)
  end
end
