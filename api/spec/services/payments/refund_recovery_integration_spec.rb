require 'rails_helper'
require_relative '../../support/refund_fixtures'

RSpec.describe 'Refund recovery and inventory effects' do
  include RefundFixtures
  let(:fixture) { captured_order }
  let(:order) { fixture.first }
  let(:provider) { double('refund provider') }

  def commit_stock
    product = create(:product, inventory_level: 'variant')
    variant = create(:product_variant, product: product, stock_quantity: 5)
    create(:order_item, order: order, product: product, product_variant: variant, quantity: 2, unit_price_cents: 500)
    Order.transaction { Order.lock.find(order.id); Payments::ReserveInventory.commit!(order: order, snapshot_digest: 'snapshot') }
    variant
  end

  before do
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(EmailService).to receive(:send_refund_notification).and_return(success: true)
    allow(SmsService).to receive(:send_refund_notification).and_return(success: true)
  end

  it 'shares restored quantities between partial/full refund and cancellation using the original pool' do
    variant = commit_stock
    expect(variant.reload.stock_quantity).to eq(3)
    allow(provider).to receive(:refund) { |**args| { raw_id: "re_#{args[:operation_key].delete('-')}", status: 'succeeded', amount_cents: args[:amount_cents] } }
    first = Payments::RefundPayment.call(order: order, amount_cents: 500, request_key: 'partial', restoration_request: { restock_items: true })
    expect(first).to include(success: true)
    expect(variant.reload.stock_quantity).to eq(5)
    variant.product.update_column(:inventory_level, 'none')
    second = Payments::RefundPayment.call(order: order, amount_cents: 1000, request_key: 'remaining', restoration_request: { restock_items: true })
    expect(second).to include(success: true)
    Payments::UpdateOrder.call(order: order, attributes: { status: 'cancelled' }, user: nil)
    expect(variant.reload.stock_quantity).to eq(5)
    expect(InventoryReservation.find_by!(order_id: order.id).restored_quantities.values.sum).to eq(2)
    expect(PaymentOutbox.where(kind: 'refund_inventory', state: 'delivered').count).to eq(2)
  end

  it 'holds inventory and money on a pending refund, then restores only after a due authenticated query succeeds' do
    variant = commit_stock
    allow(provider).to receive(:refund).and_return(raw_id: 're_pending', status: 'pending', amount_cents: 500)
    result = Payments::RefundPayment.call(order: order, amount_cents: 500, request_key: 'pending', restoration_request: { restock_items: true })
    op = result[:refund].refund_operation
    expect(variant.reload.stock_quantity).to eq(3)
    expect(RefundEffect.count).to eq(0)
    expect(order.reload.refundable_amount_cents).to eq(1000)
    expect(provider).not_to receive(:refund)
    op.update!(next_recovery_at: 1.second.ago)
    expect(provider).to receive(:query_refund).with(reference: 're_pending', operation_key: op.operation_key, original_reference: op.original_reference)
      .and_return(raw_id: 're_pending', status: 'succeeded', amount_cents: 500)
    expect(Payments::RefundPayment.new.reconcile(operation: op)).to include(success: true)
    expect(variant.reload.stock_quantity).to eq(5)
  end

  it 'recovers a reserved operation before SDK dispatch and forwards success effects after a process loss' do
    variant = commit_stock
    op = Payments::ReserveRefund.call(order: order, amount_cents: 500, request_key: 'reserved', restoration_request: { restock_items: true })
    expect(provider).to receive(:refund).with(hash_including(operation_key: op.operation_key)).and_return(raw_id: 're_bootstrap', status: 'succeeded', amount_cents: 500)
    RefundRecoveryJob.perform_now
    expect(op.reload.state).to eq('succeeded')
    expect(variant.reload.stock_quantity).to eq(5)
    expect(PaymentOutbox.where(effect_key: "refund:#{op.refund.id}:notification").count).to eq(1)
    expect(op.refund.reload.email_sent).to be false
    OutboxDispatchJob.perform_now
    expect(PaymentOutbox.find_by!(effect_key: "refund:#{op.refund.id}:notification").state).to eq('delivered')
    RefundRecoveryJob.perform_now
    expect(variant.reload.stock_quantity).to eq(5)
  end

  it 'keeps a refused request permanently undispatchable after another reservation fails' do
    allow(provider).to receive(:refund).and_return(raw_id: 're_first', status: 'pending', amount_cents: 1200)
    first = Payments::RefundPayment.call(order: order, amount_cents: 1200, request_key: 'first')
    refused = Payments::RefundPayment.call(order: order, amount_cents: 500, request_key: 'refused')
    expect(refused).to include(no_operation: true, http_status: 409)
    op = first[:refund].refund_operation
    Payments::ApplyPaymentEvent.call(operation: op, event_key: 'failed', status: 'failed', amount_cents: 1200,
      identity_id: op.payment_identity_id, original_reference: op.original_reference, raw_id: op.raw_provider_id)
    expect(Payments::RefundPayment.call(order: order, amount_cents: 500, request_key: 'refused')).to include(no_operation: true)
    expect(provider).to have_received(:refund).once
    expect(RefundOperation.where(caller_idempotency_key: 'refused')).to be_empty
  end
end
