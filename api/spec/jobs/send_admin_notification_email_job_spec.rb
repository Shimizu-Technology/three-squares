require 'rails_helper'

RSpec.describe SendAdminNotificationEmailJob, type: :job do
  describe '#perform' do
    let(:order) { create(:order, :guest) }

    before do
      allow(Rails.logger).to receive(:info)
      allow(Rails.logger).to receive(:error)
    end

    it 'sends admin notification for existing order' do
      expect(EmailService).to receive(:send_admin_notification).with(order).and_return({ success: true })

      described_class.perform_now(order.id)
    end

    it 'handles missing order gracefully' do
      expect(EmailService).not_to receive(:send_admin_notification)

      expect { described_class.perform_now(-1) }.not_to raise_error
      expect(Rails.logger).to have_received(:error).with(/not found/)
    end

    it 'persists an undelivered notification and schedules a retry on failure' do
      allow(EmailService).to receive(:send_admin_notification).and_raise(StandardError, 'boom')

      expect { described_class.perform_now(order.id) }.to have_enqueued_job(described_class)
      delivery = PaymentOutbox.find_by!(effect_key: "notification:Order:#{order.id}:admin_email")
      expect(delivery.state).to eq('pending')
      expect(delivery.delivered_at).to be_nil
      expect(delivery.last_error).to eq('StandardError')
    end
  end
end
