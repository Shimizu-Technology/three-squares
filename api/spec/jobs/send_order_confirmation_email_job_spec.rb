require 'rails_helper'

RSpec.describe SendOrderConfirmationEmailJob, type: :job do
  describe '#perform' do
    let(:order) { create(:order, :guest, confirmation_email_sent: false) }

    before do
      allow(Rails.logger).to receive(:info)
      allow(Rails.logger).to receive(:error)
    end

    it 'sends confirmation for existing order' do
      expect(EmailService).to receive(:send_order_confirmation).with(order).and_return({ success: true })

      described_class.perform_now(order.id)
      expect(order.reload.confirmation_email_sent).to be true
    end

    it 'skips when confirmation already sent (idempotency)' do
      order.update_column(:confirmation_email_sent, true)
      expect(EmailService).not_to receive(:send_order_confirmation)

      described_class.perform_now(order.id)
    end

    it 'discards missing order without raising' do
      expect(EmailService).not_to receive(:send_order_confirmation)

      # discard_on ActiveRecord::RecordNotFound prevents raise
      described_class.perform_now(-1)
    end

    it 'rolls back flag on unexpected errors so retries can re-attempt' do
      allow(EmailService).to receive(:send_order_confirmation).and_raise(StandardError, 'boom')

      # retry_on catches the raise in perform_now, but the flag should be rolled back
      described_class.perform_now(order.id)
      expect(order.reload.confirmation_email_sent).to be false
    end

    it 'rolls back flag when email service returns failure' do
      allow(EmailService).to receive(:send_order_confirmation).and_return({ success: false, error: 'SMTP down' })

      # retry_on catches the raise, but flag should be rolled back for retry
      described_class.perform_now(order.id)
      expect(order.reload.confirmation_email_sent).to be false
    end
  end
end
