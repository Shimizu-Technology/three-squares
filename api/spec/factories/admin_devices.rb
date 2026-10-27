FactoryBot.define do
  factory :admin_device do
    sequence(:device_uuid) { |n| "device-uuid-#{n}" }
    sequence(:name) { |n| "Admin Device #{n}" }
    active { true }
    last_seen_at { Time.current }
    association :user, factory: :user

    after(:build) do |device|
      device.user.role = "admin" if device.user
    end

    trait :for_location do
      association :location
    end
  end
end
