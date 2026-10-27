require "rails_helper"

RSpec.describe AdminPushNotificationService, type: :service do
  let!(:north) { create(:location, name: "North") }
  let!(:south) { create(:location, name: "South") }
  let!(:order) { create(:order, :guest, location: north, total_cents: 4200) }
  let!(:north_subscription) { create(:admin_push_subscription, admin_device: create(:admin_device, location: north)) }
  let!(:unassigned_subscription) { create(:admin_push_subscription, admin_device: create(:admin_device, location: nil)) }
  let!(:south_subscription) { create(:admin_push_subscription, admin_device: create(:admin_device, location: south)) }

  before do
    allow(WebPushConfig).to receive_messages(configured?: true, subject: "mailto:test@example.com", public_key: "public", private_key: "private")
    allow(WebPush).to receive(:payload_send)
  end

  it "only targets active subscriptions on active devices matching the order location" do
    create(:admin_push_subscription, active: false, admin_device: create(:admin_device, location: north))
    create(:admin_push_subscription, admin_device: create(:admin_device, location: north, active: false))
    result = described_class.send_new_order(order)
    expect(result).to eq(success: true, sent: 1)
    expect(WebPush).to have_received(:payload_send).once.with(hash_including(endpoint: north_subscription.endpoint, open_timeout: 5, read_timeout: 10))
    expect(north_subscription.reload.last_sent_at).to be_present
    expect(unassigned_subscription.reload.last_sent_at).to be_nil
    expect(south_subscription.reload.last_sent_at).to be_nil
  end

  it "never sends locationless order pushes, including to blank devices" do
    order.update!(location: nil)
    expect(described_class.send_new_order(order)).to include(skipped: true)
    expect(WebPush).not_to have_received(:payload_send)
  end

  it "excludes devices whose owners have since been scoped to another location or demoted" do
    north_subscription.admin_device.user.update!(assigned_location: south)
    described_class.send_new_order(order)
    expect(WebPush).not_to have_received(:payload_send)
    north_subscription.admin_device.user.update!(assigned_location: nil, role: "customer")
    described_class.send_new_order(order)
    expect(WebPush).not_to have_received(:payload_send)
  end

  it "does not send when VAPID is unconfigured" do
    allow(WebPushConfig).to receive(:configured?).and_return(false)
    expect(described_class.send_new_order(order)).to include(skipped: true)
    expect(WebPush).not_to have_received(:payload_send)
  end

  it "rejects legacy unsafe persisted endpoints before transport" do
    north_subscription.update_column(:endpoint, "https://127.0.0.1/internal")
    expect(described_class.send_new_order(order)).to include(sent: 0)
    expect(WebPush).not_to have_received(:payload_send)
    expect(north_subscription.reload).not_to be_active
  end

  it "disables expired subscriptions on a typed 410 response" do
    response = Net::HTTPGone.new("1.1", "410", "Gone")
    allow(response).to receive(:body).and_return("")
    allow(WebPush).to receive(:payload_send).and_raise(WebPush::ExpiredSubscription.new(response, "fcm.googleapis.com"))
    expect { described_class.send_new_order(order) }.not_to raise_error
    expect(north_subscription.reload).not_to be_active
  end

  it "encrypts and signs with the installed OpenSSL version while HTTP stays mocked" do
    keys = WebPush.generate_key
    allow(WebPushConfig).to receive_messages(public_key: keys.public_key, private_key: keys.private_key)
    allow(WebPush).to receive(:payload_send).and_call_original
    transport = instance_double(Net::HTTP)
    allow(Net::HTTP).to receive(:new).with("fcm.googleapis.com", 443, any_args).and_return(transport)
    allow(transport).to receive_messages(:use_ssl= => nil, :open_timeout= => nil, :read_timeout= => nil)
    response = Net::HTTPCreated.new("1.1", "201", "Created")
    expect(transport).to receive(:request) do |request|
      expect(request["Content-Encoding"]).to eq("aes128gcm")
      expect(request["Authorization"]).to start_with("vapid ")
      expect(request.body.bytesize).to be > 100
      response
    end
    expect(described_class.send_new_order(order)).to include(sent: 1)
  end

  it "raises transient errors for job retries without misclassifying message text" do
    allow(WebPush).to receive(:payload_send).and_raise(StandardError, "upstream timeout 410ms")
    expect { described_class.send_new_order(order) }.to raise_error(StandardError)
    expect(north_subscription.reload).to be_active
  end
end
