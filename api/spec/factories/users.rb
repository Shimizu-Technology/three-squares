FactoryBot.define do
  factory :user do
    sequence(:clerk_id) { |n| "clerk_test_#{n}" }
    sequence(:email) { |n| "user#{n}@example.com" }
    name { "Test User" }
    phone { "671-555-0100" }
    role { "customer" }

    trait :admin do
      role { "owner" }
    end

    trait :owner do
      role { "owner" }
    end

    trait :manager do
      role { "manager" }
    end

    trait :staff do
      role { "staff" }
      association :assigned_location, factory: :location
    end
  end
end
