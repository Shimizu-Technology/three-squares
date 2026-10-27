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

RSpec.describe 'Notification delivery acknowledgement', type: :job do
  it 'sets the delivered flag only after the transport succeeds' do
    order = create(:order)
    allow(EmailService).to receive(:send_order_confirmation) do
      expect(order.reload.confirmation_email_sent).to be false
      expect(PaymentOutbox.find_by!(effect_key: "notification:Order:#{order.id}:confirmation_email").state).to eq('dispatching')
      { success: true }
    end
    SendOrderConfirmationEmailJob.new.perform(order.id)
    expect(order.reload.confirmation_email_sent).to be true
  end

  it 'keeps a skipped send pending and unsent for durable retries' do
    order = create(:order)
    allow(EmailService).to receive(:send_order_confirmation).and_return(success: false, skipped: true)
    expect { SendOrderConfirmationEmailJob.new.perform(order.id) }.to raise_error(Payments::DeliverNotification::Retryable)
    expect(order.reload.confirmation_email_sent).to be false
    expect(PaymentOutbox.find_by!(effect_key: "notification:Order:#{order.id}:confirmation_email").state).to eq('pending')
  end
end

RSpec.describe 'Explicit notification resend', type: :job do
  it 'honors an explicitly reset delivered flag without preclaiming the new delivery' do
    order = create(:order)
    allow(EmailService).to receive(:send_order_confirmation).and_return(success: true)
    SendOrderConfirmationEmailJob.new.perform(order.id)
    order.reload.update!(confirmation_email_sent: false)
    expect(EmailService).to receive(:send_order_confirmation) do
      expect(order.reload.confirmation_email_sent).to be false
      { success: true }
    end
    SendOrderConfirmationEmailJob.new.perform(order.id)
    expect(order.reload.confirmation_email_sent).to be true
  end
end
