FactoryBot.define do
  factory :location do
    sequence(:name) { |n| "Location #{n}" }
    sequence(:slug) { |n| "location-#{n}" }
    active { true }
  end
end
