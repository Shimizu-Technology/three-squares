require "rails_helper"

RSpec.describe AdminPushSubscription, type: :model do
  %w[
    http://fcm.googleapis.com/send/token
    https://127.0.0.1/push
    https://[::1]/push
    https://169.254.169.254/latest/meta-data
    https://localhost/push
    https://fcm.googleapis.com.evil.test/push
    https://fcm.googleapis.com@evil.test/push
    https://evil.test@fcm.googleapis.com/push
    https://fcm.googleapis.com:8443/push
    https://fcm.googleapis.com/push#fragment
    https://example.com/push
    javascript:alert(1)
    /relative
  ].each do |endpoint|
    it "rejects unsafe endpoint #{endpoint}" do
      expect(build(:admin_push_subscription, endpoint: endpoint)).not_to be_valid
    end
  end

  %w[fcm.googleapis.com updates.push.services.mozilla.com web.push.apple.com].each do |host|
    it "accepts the #{host} push service" do
      expect(build(:admin_push_subscription, endpoint: "https://#{host}/push/token")).to be_valid
    end
  end

  it "rejects malformed and invalid-curve subscription keys" do
    ["", "not-base64!", Base64.urlsafe_encode64("\x04" + "p" * 64)].each do |key|
      expect(build(:admin_push_subscription, p256dh_key: key)).not_to be_valid
    end
    expect(build(:admin_push_subscription, auth_key: Base64.urlsafe_encode64("short"))).not_to be_valid
  end
end
