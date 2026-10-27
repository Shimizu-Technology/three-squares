require 'rails_helper'

RSpec.describe Payments::Simulation::Provider do
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'simulated', external_account_id: 'local_fixture', profile_key: SecureRandom.uuid, credential_reference: 'simulation') }
  let(:provider) { described_class.new(identity) }
  let(:product) { create(:product, inventory_level: 'product', product_stock_quantity: 5) }
  let(:order) { create(:order, simulated: true, payment_environment: 'simulated', payment_provider: 'worldpay', payment_identity_id: identity.id) }
  let(:session) do
    item = order.order_items.create!(product: product, product_variant: product.product_variants.first, quantity: 1, unit_price_cents: 1500)
    snapshot = { 'order' => order.attributes.slice('user_id', 'location_id', 'total_cents', 'order_type', 'customer_email', 'payment_method'),
      'items' => [item.attributes.slice('id', 'product_id', 'product_variant_id', 'quantity', 'unit_price_cents', 'total_price_cents')] }
    CheckoutSession.create!(order: order, payment_identity: identity, owner_key: SecureRandom.hex(32), guest_capability_digest: CheckoutSession.digest('a' * 64),
      caller_idempotency_key: SecureRandom.uuid, snapshot: snapshot, snapshot_digest: Payments::Snapshot.digest(snapshot), amount_cents: 1500, expires_at: 1.hour.from_now)
  end
  let(:attempt) do
    row = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: 1500, payload_digest: session.snapshot_digest)
    order.update!(checkout_session_id: session.id, payment_attempt_id: row.id)
    Payments::Snapshot.persist!(session: session, attempt: row, order: order)
    row
  end
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    allow(Payments::Eligibility).to receive(:validate_order!).and_return(true)
  end

  def prepare
    config = provider.setup(attempt: attempt)
    attempt.update!(raw_provider_id: config[:raw_id], state: 'collecting')
    config[:client_secret]
  end

  def collect(scenario)
    handle = prepare
    provider.collect(attempt: attempt, handle: handle, scenario: scenario)
  end

  it 'persists idempotent setup and a secret handle bound to an owned attempt' do
    first = provider.setup(attempt: attempt)
    expect(described_class.new(identity).setup(attempt: attempt)).to eq(first)
    expect { provider.collect(attempt: attempt, handle: 'sim_arbitrary', scenario: 'approve') }.to raise_error(Payments::BindingError)
    expect(SimulatedPaymentRecord.count).to eq(1)
  end

  it 'passes approve through the XML parser and sole finalizer exactly once' do
    result = collect('approve')
    2.times { Payments::FinalizeOrder.call(attempt: attempt, result: result) }
    expect(order.reload.payment_status).to eq('paid')
    expect(product.reload.product_stock_quantity).to eq(4)
    expect(InventoryCommitment.where(order: order).count).to eq(1)
    expect(PaymentOutbox.pluck(:kind)).to eq(['cart_cleanup']) # no real notifications/fulfillment
  end

  %w[decline expired terminal_offline busy invalid_pin cancel_before_card network_error].each do |scenario|
    it "does not fulfill #{scenario}" do
      Payments::FinalizeOrder.call(attempt: attempt, result: collect(scenario))
      expect(order.reload.payment_status).to eq('pending')
      expect(product.reload.product_stock_quantity).to eq(5)
      expect(InventoryCommitment.where(order: order)).to be_empty
    end
  end

  %w[partial avs_fail cvv_fail].each do |scenario|
    it "compensates actual money for #{scenario} and never fulfills" do
      Payments::FinalizeOrder.call(attempt: attempt, result: collect(scenario))
      expect(attempt.reload.compensation_claimed_at).to be_present
      Payments::CompensateAttempt.call(attempt: attempt)
      expect(attempt.reload.state).to eq('compensated')
      expect(order.reload.payment_status).to eq('pending')
      expect(product.reload.product_stock_quantity).to eq(5)
    end
  end

  it 'queries a duplicate hint until the original capture is proven without compensating it' do
    Payments::FinalizeOrder.call(attempt: attempt, result: collect('duplicate'))
    expect(attempt.reload.compensation_claimed_at).to be_nil
    expect(order.reload.payment_status).to eq('pending')
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    expect(order.reload.payment_status).to eq('paid')
    expect(SimulatedPaymentRecord.where(kind:'collection').count).to eq(1)
    expect(SimulatedPaymentRecord.where(kind:'reversal')).to be_empty
  end

  it 'compensates a late capture after confirmed cancellation and deduplicates replayed events' do
    expect { collect('cancel_race') }.to raise_error(Payments::Error)
    Payments::CancelCheckout.call(attempt: attempt)
    expect(attempt.reload.state).to eq('cancelled')
    2.times { SimulationClock.for(identity).advance!(61) }
    expect(attempt.reload.state).to eq('compensated')
    expect(order.reload.payment_status).to eq('pending')
    expect(product.reload.product_stock_quantity).to eq(5)
    expect(SimulatedPaymentRecord.where(kind:'reversal').count).to eq(1)
  end

  it 'converges duplicate scheduled capture events on one charge and stock commitment' do
    Payments::FinalizeOrder.call(attempt: attempt, result: collect('duplicate_event'))
    2.times { SimulationClock.for(identity).advance!(61) }
    expect(InventoryCommitment.where(order:order).count).to eq(1)
    expect(product.reload.product_stock_quantity).to eq(4)
    expect(SimulatedPaymentRecord.first.facts['event_delivered']).to be(true)
  end

  it 'recovers a lost approval after a provider restart without redispatch' do
    expect { collect('timeout_after_approval') }.to raise_error(Payments::Error)
    recovered = described_class.new(identity).query(attempt: attempt)
    Payments::FinalizeOrder.call(attempt: attempt, result: recovered)
    expect(order.reload.payment_status).to eq('paid')
    expect(SimulatedPaymentRecord.where(kind: 'collection').count).to eq(1)
  end

  it 'retains an unknown outcome during query lag until virtual time advances' do
    Payments::FinalizeOrder.call(attempt: attempt, result: collect('query_lag'))
    expect(order.reload.payment_status).to eq('pending')
    SimulationClock.for(identity).advance!(61)
    Payments::FinalizeOrder.call(attempt: attempt, result: provider.query(attempt: attempt))
    expect(order.reload.payment_status).to eq('paid')
  end

  it 'retries before dispatch with the same handle and operation; rejects changed replay' do
    handle = prepare
    expect { provider.collect(attempt: attempt, handle: handle, scenario: 'timeout_before_dispatch') }.to raise_error(Payments::Error)
    expect(SimulatedPaymentRecord.first.state).to eq('collecting')
    provider.collect(attempt: attempt, handle: handle, scenario: 'approve')
    expect { provider.collect(attempt: attempt, handle: handle, scenario: 'decline') }.to raise_error(Payments::Conflict)
    expect(SimulatedPaymentRecord.count).to eq(1)
  end

  it 'does not grant a forged or foreign reference financial authority' do
    result = collect('approve')
    foreign = result.with(identity_id: SecureRandom.uuid)
    expect { Payments::FinalizeOrder.call(attempt: attempt, result: foreign) }.to raise_error(Payments::BindingError)
    expect { provider.refund(attempt: attempt, reference: 'sim_foreign', amount_cents: 100, operation_key: SecureRandom.uuid, metadata: {}) }.to raise_error(Payments::BindingError)
    expect(product.reload.product_stock_quantity).to eq(5)
  end

  it 'persists a refund with lost response and recovers it using only its frozen key' do
    Payments::FinalizeOrder.call(attempt: attempt, result: collect('refund_timeout'))
    key = SecureRandom.uuid
    expect { provider.refund(attempt: attempt, reference: attempt.raw_provider_id, amount_cents: 300, operation_key: key, metadata: {}) }.to raise_error(Payments::Error)
    result = described_class.new(identity).query_refund(reference: nil, operation_key: key, original_reference: attempt.raw_provider_id)
    expect(result).to include(status: 'succeeded', amount_cents: 300)
    expect { provider.refund(attempt: attempt, reference: attempt.raw_provider_id, amount_cents: 301, operation_key: key, metadata: {}) }.to raise_error(Payments::Conflict)
  end

  it 'rechecks production authority on queued/reloaded adapter use' do
    prepare
    allow(Payments::Configuration).to receive(:production?).and_return(true)
    allow(Payments::Configuration).to receive(:validate_environment!)
    expect { provider.query(attempt: attempt) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect { provider.refund(attempt: attempt, reference: attempt.raw_provider_id, amount_cents: 100, operation_key: SecureRandom.uuid, metadata: {}) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
  end
end
