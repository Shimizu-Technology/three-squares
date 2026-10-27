require "rails_helper"

RSpec.describe SendAdminPushNotificationJob, type: :job do
  let(:order) { create(:order, :guest) }

  it "delegates to the admin push notification service" do
    expect(AdminPushNotificationService).to receive(:send_new_order).with(order)

    described_class.perform_now(order.id)
  end
  it "keeps provider response capabilities out of framework retry and exhaustion logs" do
    output = StringIO.new
    logger = ActiveSupport::Logger.new(output)
    original = described_class.logger
    described_class.logger = logger
    allow(AdminPushNotificationService).to receive(:send_new_order)
      .and_raise(StandardError, "SENSITIVE_PUSH_RESPONSE_MARKER")

    job = described_class.new(order.id)
    3.times { job.perform_now }
    expect(output.string).to include("DeliveryError")
    expect(output.string).not_to include("SENSITIVE_PUSH_RESPONSE_MARKER")
    expect(job.exception_executions.values).to include(3)
  ensure
    described_class.logger = original
  end

end
