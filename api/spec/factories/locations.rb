FactoryBot.define do
  factory :location do
    sequence(:name) { |n| "Location #{n}" }
    sequence(:slug) { |n| "location-#{n}" }
    address { "123 Example Street" }
    phone { "671-555-0100" }
    active { true }
    hours_json { {} }
    admin_sms_phones { [] }
  end
end
