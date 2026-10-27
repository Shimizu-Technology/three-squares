FactoryBot.define do
  factory :admin_push_subscription do
    association :admin_device
    sequence(:endpoint) { |n| "https://fcm.googleapis.com/fcm/send/#{n}" }
    p256dh_key { Base64.urlsafe_encode64(OpenSSL::PKey::EC.generate("prime256v1").public_key.to_octet_string(:uncompressed), padding: false) }
    auth_key { Base64.urlsafe_encode64("a" * 16, padding: false) }
    active { true }
  end
end
