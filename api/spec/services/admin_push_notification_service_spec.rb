require "rails_helper"

RSpec.describe AdminPushNotificationService, type: :service do
  let!(:north_location) { create(:location, name: "North") }
  let!(:south_location) { create(:location, name: "South") }
  let!(:order) { create(:order, :guest, location: north_location, total_cents: 4200) }
  let!(:north_device) { create(:admin_device, location: north_location) }
  let!(:global_device) { create(:admin_device, location: nil) }
  let!(:south_device) { create(:admin_device, location: south_location) }
  let!(:north_subscription) { create(:admin_push_subscription, admin_device: north_device, endpoint: "https://push.test/north") }
  let!(:global_subscription) { create(:admin_push_subscription, admin_device: global_device, endpoint: "https://push.test/global") }
  let!(:south_subscription) { create(:admin_push_subscription, admin_device: south_device, endpoint: "https://push.test/south") }

  before do
    allow(WebPushConfig).to receive(:configured?).and_return(true)
    allow(WebPushConfig).to receive(:subject).and_return("mailto:test@example.com")
    allow(WebPushConfig).to receive(:public_key).and_return("public")
    allow(WebPushConfig).to receive(:private_key).and_return("private")
  end

  it "targets location-matched and global subscriptions for a new order" do
    sent_endpoints = []
    allow(Webpush).to receive(:payload_send) do |args|
      sent_endpoints << args[:endpoint]
    end

    result = described_class.send_new_order(order)

    expect(result[:success]).to be true
    expect(sent_endpoints).to contain_exactly(
      north_subscription.endpoint,
      global_subscription.endpoint
    )
    expect(sent_endpoints).not_to include(south_subscription.endpoint)
  end

  it "disables subscriptions that return permanent invalid errors" do
    allow(Webpush).to receive(:payload_send).and_raise(StandardError, "410 Gone")

    expect do
      described_class.send_new_order(order)
    end.not_to raise_error

    expect(north_subscription.reload.active).to be false
  end
end
