require "rails_helper"

RSpec.describe SendAdminPushNotificationJob, type: :job do
  let(:order) { create(:order, :guest) }

  it "delegates to the admin push notification service" do
    expect(AdminPushNotificationService).to receive(:send_new_order).with(order)

    described_class.perform_now(order.id)
  end
end
