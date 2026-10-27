FactoryBot.define do
  factory :admin_push_subscription do
    association :admin_device
    sequence(:endpoint) { |n| "https://example.com/push/#{n}" }
    p256dh_key { "test-p256dh-key" }
    auth_key { "test-auth-key" }
    active { true }
  end
end
