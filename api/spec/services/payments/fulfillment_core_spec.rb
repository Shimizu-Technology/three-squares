require 'rails_helper'

RSpec.describe 'Durable payment fulfillment core' do
  self.use_transactional_tests = false

  def fixture(stock: 5, product: nil, quantity: 1, raw_id: SecureRandom.hex(8))
    identity = PaymentIdentity.first || PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_core', profile_key: SecureRandom.uuid, credential_reference: 'stripe_default')
    product ||= create(:product, inventory_level: 'product', product_stock_quantity: stock)
    variant = product.product_variants.first
    order = create(:order)
    item = order.order_items.create!(product: product, product_variant: variant, quantity: quantity, unit_price_cents: 1000)
    cart = CartItem.create!(session_id: SecureRandom.uuid, product_variant: variant, quantity: quantity)
    snapshot = { 'order' => order.attributes.slice('user_id', 'location_id', 'total_cents', 'order_type', 'customer_email', 'payment_method'),
      'items' => [item.attributes.slice('id', 'product_id', 'product_variant_id', 'quantity', 'unit_price_cents', 'total_price_cents')],
      'cart_items' => [{ 'id' => cart.id, 'quantity' => cart.quantity, 'updated_at' => cart.updated_at.iso8601(6) }] }
    session = CheckoutSession.create!(order: order, payment_identity: identity, owner_key: SecureRandom.hex(32), guest_capability_digest: 'capability',
      caller_idempotency_key: SecureRandom.uuid, snapshot: snapshot, snapshot_digest: Payments::Snapshot.digest(snapshot), amount_cents: order.total_cents, expires_at: 1.hour.from_now)
    attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity, requested_cents: order.total_cents,
      payload_digest: session.snapshot_digest, raw_provider_id: raw_id)
    order.update!(payment_identity_id: identity.id, payment_attempt_id: attempt.id, checkout_session_id: session.id,
      payment_environment: identity.environment, payment_provider: identity.provider)
    Payments::Snapshot.persist!(session: session, attempt: attempt, order: order)
    [attempt, order, product, cart]
  end

  def result(attempt, **changes)
    Payments::Result.new(**{ status: 'captured', identity_id: attempt.payment_identity_id, raw_id: attempt.raw_provider_id,
      requested_cents: attempt.requested_cents, approved_cents: attempt.requested_cents, captured_cents: attempt.requested_cents,
      currency: attempt.currency, metadata: {} }.merge(changes))
  end

  def race(*blocks)
    ready = Queue.new
    gate = Queue.new
    workers = blocks.map do |block|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          gate.pop
          block.call
        end
      end
    end
    blocks.size.times { ready.pop }
    blocks.size.times { gate << true }
    workers.map(&:value)
  end

  before do
    configured_name = ActiveRecord::Base.connection_db_config.database
    actual_name = ActiveRecord::Base.connection.select_value('SELECT current_database()')
    raise 'Dedicated test database required' unless Rails.env.test? && actual_name == configured_name && actual_name.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(actual_name)
    @dedicated_database_verified = true
    SiteSetting.instance.update!(enable_order_emails: true, enable_order_sms: true, enable_admin_sms: true)
    stub_const('Payments::Eligibility', Class.new do
      def self.validate_order!(_order); true; end
    end)
  end

  after do
    next unless @dedicated_database_verified
    connection = ActiveRecord::Base.connection
    tables = connection.tables - %w[schema_migrations ar_internal_metadata]
    connection.execute("TRUNCATE #{tables.map { |name| connection.quote_table_name(name) }.join(', ')} RESTART IDENTITY CASCADE")
  end

  it 'canonicalizes nested hashes without changing array order or scalar types' do
    expect(Payments::Snapshot.digest({ b: { z: 2, a: 1 }, a: [1, '2'] })).to eq(Payments::Snapshot.digest({ 'a' => [1, '2'], 'b' => { 'a' => 1, 'z' => 2 } }))
    expect(Payments::Snapshot.digest([1, 2])).not_to eq(Payments::Snapshot.digest([2, 1]))
  end

  it 'commits stock and outbox exactly once under simultaneous capture/finalize' do
    attempt, order, product = fixture
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    race(*2.times.map { -> { Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt)) } })
    expect(order.reload.payment_status).to eq('paid')
    expect(product.reload.product_stock_quantity).to eq(4)
    expect(InventoryCommitment.where(order_id: order.id).count).to eq(1)
    expect(PaymentTransaction.where(order_id: order.id).count).to eq(1)
    expect(PaymentOutbox.count).to eq(6)
    expect(PaymentOutbox.pluck(:effect_key).uniq.size).to eq(6)
  end

  it 'commits inventory when a webhook set payment_status paid first' do
    attempt, order, product = fixture
    order.update!(payment_status: 'paid')
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(product.reload.product_stock_quantity).to eq(4)
    expect(order.reload.inventory_commitment_id).to be_present
  end

  it 'rejects foreign charge consumption and never claims a reversal' do
    first, first_order = fixture
    Payments::FinalizeOrder.call(attempt: first, result: result(first))
    other, = fixture(raw_id: nil)
    expect { Payments::FinalizeOrder.call(attempt: other, result: result(other, raw_id: first.raw_provider_id)) }.to raise_error(Payments::BindingError)
    expect(PaymentTransaction.find_by!(payment_attempt_id: first.id).order_id).to eq(first_order.id)
    expect(other.reload.compensation_claimed_at).to be_nil
    expect(PaymentOutbox.where(kind: 'compensate')).to be_empty
  end

  it 'rejects result identity/raw ID/amount/currency mismatches without reversal' do
    attempt, = fixture
    [{identity_id: SecureRandom.uuid}, {raw_id: 'foreign'}, {requested_cents: 1}, {currency: 'EUR'}].each do |changes|
      expect { Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, **changes)) }.to raise_error(Payments::BindingError)
    end
    expect(PaymentOutbox.count).to eq(0)
  end

  it 'reserves the grouped shared product stock and prevents concurrent overrun' do
    _, order, product = fixture(stock: 1)
    _, other = fixture(product: product)
    outcomes = race(*[order, other].map do |target|
      -> do
        Payments::ReserveInventory.call(order: target, expires_at: 1.hour.from_now)
        :reserved
      rescue Payments::ReserveInventory::Unavailable
        :unavailable
      end
    end)
    expect(outcomes.sort).to eq(%i[reserved unavailable])
    expect(InventoryReservation.where(state: 'held').sum(:quantity)).to eq(1)
  end

  it 'groups separate variants of one product before checking stock' do
    _, order, product = fixture(stock: 1)
    variant = product.product_variants.create!(size: 'Other', stock_quantity: 0, price_cents: 1000, weight_oz: 1)
    order.order_items.create!(product: product, product_variant: variant, quantity: 1, unit_price_cents: 1000)
    expect { Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now) }.to raise_error(Payments::ReserveInventory::Unavailable)
    expect(InventoryReservation.count).to eq(0)
  end

  it 'retains partial capture evidence and claims compensation without fulfillment' do
    attempt, order, product = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 700, captured_cents: 700))
    expect(attempt.reload.state).to eq('compensation_required')
    expect(attempt.compensation_operation_key).to be_present
    expect(PaymentTransaction.find_by!(payment_attempt_id: attempt.id).amount_cents).to eq(700)
    expect(order.reload.payment_status).to eq('pending')
    expect(product.reload.product_stock_quantity).to eq(5)
    expect(PaymentOutbox.where(kind: 'compensate').count).to eq(1)
  end

  it 'compensates an incomplete capture for the actual captured cents without fulfilling' do
    attempt, order = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 1500, captured_cents: 700))
    provider = instance_double(Payments::StripeProvider)
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:reverse).and_return({raw_id: 're_partial_capture', status: 'succeeded', amount_cents: 700})
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('compensated')
    expect(order.reload.inventory_committed_at).to be_nil
  end

  it 'retains increased capture evidence after a claim without mutating a dispatched financial payload' do
    attempt, order = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 700, captured_cents: 700))
    key = attempt.reload.compensation_operation_key
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(attempt.reload.captured_cents).to eq(1500)
    expect(attempt.error_classification).to eq('manual_reconciliation_required')
    expect(attempt.compensation_operation_key).to eq(key)
    expect(Payments::ProviderResolver).not_to receive(:for_identity)
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(order.reload.inventory_committed_at).to be_nil
  end

  it 'makes a compensation claim exclude a simultaneous finalizer' do
    attempt, order, product = fixture
    charge = PaymentTransaction.create!(payment_identity: attempt.payment_identity, payment_attempt: attempt, provider: 'stripe', raw_provider_id: attempt.raw_provider_id,
      reference: attempt.payment_identity.canonical_reference(attempt.raw_provider_id), currency: 'USD', amount_cents: 1500, state: 'captured', first_observed_at: Time.current, last_observed_at: Time.current)
    attempt.update!(state: 'compensation_required', approved_cents: 1500, captured_cents: 1500)
    outcomes = race(
      -> { Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt)); :finalized },
      -> do
        Payments::CompensateAttempt.claim!(attempt: attempt)
        :claimed
      rescue Payments::BindingError
        :fulfilled_first
      end
    )
    if attempt.reload.compensation_claimed_at
      expect(InventoryCommitment.where(order_id: order.id)).to be_empty
      expect(charge.reload.order_id).to be_nil
      expect(product.reload.product_stock_quantity).to eq(5)
    else
      expect(outcomes).to include(:fulfilled_first)
      expect(charge.reload.order_id).to eq(order.id)
      expect(product.reload.product_stock_quantity).to eq(4)
    end
  end

  it 'keeps the compensation key and reservation through unknown reversal and restart' do
    attempt, order = fixture
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 700, captured_cents: 700))
    key = attempt.reload.compensation_operation_key
    provider = instance_double(Payments::StripeProvider)
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:reverse).with(attempt: an_instance_of(PaymentAttempt), operation_key: key).and_return({raw_id: nil, status: 'unknown', amount_cents: 700})
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('reconciliation_required')
    expect(InventoryReservation.find_by!(order_id: order.id).state).to eq('held')
    expect(provider).to receive(:reverse).with(attempt: an_instance_of(PaymentAttempt), operation_key: key).and_return({raw_id: 're_fixture', status: 'succeeded', amount_cents: 700})
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.find(attempt.id))
    expect(attempt.reload.state).to eq('compensated')
    expect(attempt.compensation_operation_key).to eq(key)
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(order.reload.payment_status).to eq('pending')
  end

  it 'queries the stored pending reversal ID rather than creating a second refund' do
    attempt, order = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 700, captured_cents: 700))
    # Parent supplies the Stripe methods; this fixture implements their contract.
    provider = Class.new do
      def reverse(attempt:, operation_key:); end
      def query_reversal(attempt:, operation_key:); end
    end.new
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:reverse).once.and_return({raw_id: 're_pending', status: 'pending', amount_cents: 700})
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(attempt.reload.compensation_provider_id).to eq('re_pending')
    expect(attempt.compensation_claimed_at).to be_present
    expect(provider).to receive(:query_reversal) do |attempt:, operation_key:|
      expect(attempt.compensation_provider_id).to eq('re_pending')
      expect(operation_key).to eq(attempt.compensation_operation_key)
      {raw_id: 're_pending', status: 'succeeded', amount_cents: 700}
    end
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.find(attempt.id))
    expect(attempt.reload.state).to eq('compensated')
    expect(order.reload.payment_status).to eq('pending')
  end

  it 'does not redispatch an unknown reversal after its bounded idempotency window' do
    attempt, = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, approved_cents: 700, captured_cents: 700))
    attempt.update!(compensation_dispatched_at: 24.hours.ago)
    expect(Payments::ProviderResolver).not_to receive(:for_identity)
    Payments::CompensateAttempt.call(attempt: PaymentAttempt.find(attempt.id))
    expect(attempt.reload.state).to eq('reconciliation_required')
    expect(attempt.error_classification).to eq('manual_reconciliation_required')
    expect(attempt.compensation_claimed_at).to be_present
  end

  it 'saves a raw-less query ID outside locks and finalizes without a browser' do
    attempt, order = fixture(raw_id: nil)
    attempt.update!(state: 'dispatching', dispatched_at: 1.minute.ago)
    provider = instance_double(Payments::StripeProvider)
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:query) do |attempt:|
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      result(attempt, status: 'collecting', raw_id: 'pi_recovered', approved_cents: 0, captured_cents: 0)
    end
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(attempt.reload.raw_provider_id).to eq('pi_recovered')
    expect(attempt.state).to eq('collecting')
    expect(attempt.retry_count).to eq(1)
    attempt.update!(last_queried_at: 3.seconds.ago)
    expect(provider).to receive(:query).and_return(result(attempt))
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.find(attempt.id))
    expect(order.reload.payment_status).to eq('paid')
  end

  it 'never regresses a captured/compensated payment on unknown or delayed decline' do
    attempt, order = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt, status: 'failed', approved_cents: 0, captured_cents: 0))
    expect(attempt.reload.state).to eq('captured')
    expect(order.reload.payment_status).to eq('paid')
  end

  it 'retains capture and compensates eligibility failure or changed snapshot' do
    attempt, order, product = fixture
    allow(Payments::Eligibility).to receive(:validate_order!).and_raise(Payments::FulfillmentError, 'Closed')
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(attempt.reload.compensation_claimed_at).to be_present
    expect(product.reload.product_stock_quantity).to eq(5)
    expect(order.reload.payment_status).to eq('pending')
  end

  it 'cleans only matching purchased cart rows, preserving edits and additions' do
    attempt, _, _, cart = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    Payments::CartCleanup.call(session: attempt.checkout_session.reload)
    expect(CartItem.exists?(cart.id)).to be(false)
    other, _, _, edited = fixture
    Payments::FinalizeOrder.call(attempt: other, result: result(other))
    edited.update!(quantity: 2)
    addition = CartItem.create!(session_id: edited.session_id, product_variant: cart.product_variant, quantity: 1)
    Payments::CartCleanup.call(session: other.checkout_session.reload)
    expect(edited.reload.quantity).to eq(2)
    expect(CartItem.exists?(addition.id)).to be(true)
  end

  it 'retries a stale outbox claim after a process restart and acknowledges after delivery' do
    attempt, order = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    row = PaymentOutbox.find_by!(kind: 'confirmation_email')
    row.update!(state: 'dispatching', lease_token: SecureRandom.uuid, lease_until: 1.minute.ago)
    allow(EmailService).to receive(:send_order_confirmation).and_return({success: false, error: 'offline'})
    expect { Payments::DispatchOutbox.call(outbox: PaymentOutbox.find(row.id)) }.to raise_error(Payments::DeliverNotification::Retryable)
    expect(row.reload.state).to eq('pending')
    expect(order.reload.confirmation_email_sent).to be(false)
    PaymentOutbox.where.not(state: 'delivered').update_all(next_attempt_at: 1.second.ago)
    allow(EmailService).to receive(:send_order_confirmation) do
      expect(order.reload.confirmation_email_sent).to be(false)
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      {success: true}
    end
    Payments::DispatchOutbox.call(outbox: PaymentOutbox.find(row.id))
    expect(row.reload.state).to eq('delivered')
    expect(order.reload.confirmation_email_sent).to be(true)
    expect(EmailService).to receive(:send_order_confirmation).never
    Payments::DispatchOutbox.call(outbox: row.reload)
  end

  it 'recovers a crashed notification consumer lease rather than treating it as delivered' do
    _, order = fixture
    row = PaymentOutbox.record!(effect_key: "notification:Order:#{order.id}:confirmation_email", kind: 'notification',
      payload: { 'job' => 'SendOrderConfirmationEmailJob', 'args' => [order.id] })
    row.update!(state: 'dispatching', lease_token: SecureRandom.uuid, lease_until: 1.second.ago)
    allow(EmailService).to receive(:send_order_confirmation).and_return(success: true)
    Payments::DispatchOutbox.call(outbox: PaymentOutbox.find(row.id))
    expect(row.reload.state).to eq('delivered')
    expect(order.reload.confirmation_email_sent).to be true
  end

  it 'blocks reversal after finalization consumes the charge' do
    attempt, = fixture
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect { Payments::CompensateAttempt.claim!(attempt: attempt) }.to raise_error(Payments::BindingError)
    expect { Payments::CompensateAttempt.call(attempt: attempt) }.to raise_error(Payments::BindingError)
  end

  it 'does not hold locks during reversal and prevents fulfillment while it is in flight' do
    attempt, order = fixture
    allow(Payments::Eligibility).to receive(:validate_order!).and_raise(Payments::FulfillmentError, 'Closed')
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    allow(Payments::Eligibility).to receive(:validate_order!).and_return(true)
    provider = instance_double(Payments::StripeProvider)
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:reverse) do |attempt:, operation_key:|
      expect(ActiveRecord::Base.connection.transaction_open?).to be false
      expect(operation_key).to eq(attempt.compensation_operation_key)
      Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
      expect(order.reload.payment_status).to eq('pending')
      {raw_id: 're_fixture', status: 'succeeded', amount_cents: 1500}
    end
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('compensated')
  end

  it 'commits cash POS stock/outbox once with no provider identity' do
    product = create(:product, inventory_level: 'product', product_stock_quantity: 2)
    order = create(:order, source: 'pos', staff_created: true, fulfillment_type: 'pickup', location: create(:location), payment_method: 'cash', payment_environment: 'sandbox')
    order.order_items.create!(product: product, product_variant: product.product_variants.first, quantity: 1, unit_price_cents: 1000)
    Payments::ReserveInventory.call(order: order, expires_at: 10.minutes.from_now)
    race(*2.times.map { -> { Payments::FinalizeOrder.call_cash(order: order) } })
    expect(order.reload.payment_status).to eq('paid')
    expect(product.reload.product_stock_quantity).to eq(1)
    expect(PaymentIdentity.count).to eq(0)
    expect(PaymentTransaction.count).to eq(0)
    expect(InventoryReservation.find_by!(order_id: order.id).state).to eq('committed')
    expect(PaymentOutbox.count).to eq(5)
  end

  it 'delivers refund email and SMS independently through a durable outbox effect' do
    _, order = fixture
    settings = SiteSetting.instance
    settings.update!(enable_order_emails: true, enable_order_sms: true)
    refund = Refund.create!(order: order, status: 'succeeded', amount_cents: 500)
    row = PaymentOutbox.record!(effect_key: "refund:#{refund.id}:notification", kind: 'refund_notification', payload: { 'refund_id' => refund.id })
    allow(EmailService).to receive(:send_refund_notification).and_return(success: true)
    allow(SmsService).to receive(:send_refund_notification).and_return(success: false, reason: 'carrier unavailable')
    expect { Payments::DispatchOutbox.call(outbox: row) }.to raise_error(Payments::DeliverNotification::Retryable)
    expect(refund.reload.email_sent).to be true
    expect(refund.sms_sent).to be false
    expect(row.reload.state).to eq('pending')
    expect(EmailService).not_to receive(:send_refund_notification)
    allow(SmsService).to receive(:send_refund_notification).and_return(success: true)
    PaymentOutbox.where(state: 'pending').update_all(next_attempt_at: 1.second.ago)
    row.update!(next_attempt_at: 1.second.ago)
    Payments::DispatchOutbox.call(outbox: row)
    expect(refund.reload.sms_sent).to be true
    expect(row.reload.state).to eq('delivered')
  end

  it 'sends admin SMS independently of the customer SMS toggle and records per-phone delivery' do
    _, order = fixture
    SiteSetting.instance.update!(enable_order_sms: false, enable_admin_sms: true, admin_sms_phones: ['6715551234', '6715555678'])
    allow(SmsService).to receive(:sms_configured?).and_return(true)
    expect(SmsService).to receive(:send_sms).with(to: '6715551234', body: anything, context: anything).and_return(success: true)
    expect(SmsService).to receive(:send_sms).with(to: '6715555678', body: anything, context: anything).and_return(success: true)
    SendAdminOrderSmsJob.new.perform(order.id)
    expect(PaymentOutbox.where(kind: 'notification', state: 'delivered').count).to eq(2)
    expect(SmsService).not_to receive(:send_sms)
    SendAdminOrderSmsJob.new.perform(order.id)
  end

  it 'fails closed for unbound legacy reversal references' do
    expect(Stripe::Refund).not_to receive(:create)
    expect { ProcessPaymentReversalJob.new.perform('pi_unbound') }.to raise_error(Payments::BindingError)
  end
  it 'cancels an uncommitted intent without increasing stock and compensates a late capture' do
    attempt, order, product = fixture
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    Payments::UpdateOrder.call(order: order, attributes: { status: 'cancelled' }, user: nil)
    expect(product.reload.product_stock_quantity).to eq(5)
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(order.reload.status).to eq('cancelled')
    expect(order.inventory_commitment_id).to be_nil
    expect(attempt.reload.compensation_claimed_at).to be_present
    expect(product.reload.product_stock_quantity).to eq(5)
  end

  it 'serializes cancellation against finalization without stock inflation or resurrection' do
    attempt, order, product = fixture
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    race(-> { Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt)) },
      -> { Payments::UpdateOrder.call(order: order, attributes: { status: 'cancelled' }, user: nil) })
    expect(order.reload.status).to eq('cancelled')
    expect(product.reload.product_stock_quantity).to eq(5)
    expect { Payments::UpdateOrder.call(order: order, attributes: { status: 'pending' }, user: nil) }.to raise_error(Payments::Conflict)
  end

  it 'shares per-item restoration across repeated decisions using the original committed stock pool' do
    attempt, order, product = fixture(quantity: 2)
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    product.update_column(:inventory_level, 'variant')
    item = order.order_items.first
    Payments::RestoreInventory.call(order: order, item_ids: [item.id])
    Payments::RestoreInventory.call(order: order)
    expect(product.reload.product_stock_quantity).to eq(5)
    expect(InventoryReservation.find_by!(order_id: order.id).restored_quantities).to eq(item.id.to_s => 2)
  end

  it 'does not regress compensation when collection configuration recovery fails' do
    attempt, = fixture
    provider = double('provider')
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:collection) do
      attempt.update!(state: 'compensated')
      raise Stripe::APIConnectionError, 'fixture interrupted response'
    end
    expect { Payments::SetupAttempt.call(attempt: attempt) }.to raise_error(Stripe::APIConnectionError)
    expect(attempt.reload.state).to eq('compensated')
  end

  it 'retries a pre-send setup failure only with its original operation and within the idempotency window' do
    attempt, = fixture(raw_id: nil)
    key = attempt.operation_key
    provider = double('provider')
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:setup).and_raise(Stripe::APIConnectionError, 'fixture before send')
    expect { Payments::SetupAttempt.call(attempt: attempt) }.to raise_error(Stripe::APIConnectionError)
    attempt.update!(next_recovery_at: 1.second.ago)
    allow(provider).to receive(:setup).and_return({ raw_id: 'pi_retry_same_operation', flow: 'stripe_embedded', client_secret: 'fixture' })
    Payments::SetupAttempt.call(attempt: attempt)
    expect(attempt.reload.operation_key).to eq(key)
    expect(attempt.state).to eq('collecting')
    expect(provider).to have_received(:setup).twice
  end

  it 'rejects recovered nonproduction attempts in production before provider dispatch' do
    attempt, order = fixture
    allow(Payments::Configuration).to receive(:production?).and_return(true)
    allow(Payments::Configuration).to receive(:validate_environment!).and_return(true)
    expect(Payments::ProviderResolver).not_to receive(:for_identity)
    expect { Payments::ReconcileAttempt.call(attempt: attempt) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect(order.reload.payment_status).to eq('pending')
    expect(InventoryCommitment.count).to eq(0)
  end

  it 'spaces repeated request queries without losing a later capture' do
    attempt, = fixture
    provider = double('provider', query: result(attempt, status: 'unknown', approved_cents: 0, captured_cents: 0))
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    2.times { Payments::ReconcileAttempt.call(attempt: attempt) }
    expect(provider).to have_received(:query).once
  end

  it 'acknowledges the status intent and consumer delivery without starving later outbox work' do
    _, order = fixture
    order.update!(fulfillment_type: 'pickup', location: create(:location), payment_status: 'paid')
    allow(EmailService).to receive(:send_order_confirmed_email).and_return(success: true)
    Payments::UpdateOrder.call(order: order, attributes: { status: 'confirmed' }, user: nil)
    intent = PaymentOutbox.find_by!(kind: 'notification', effect_key: PaymentOutbox.where("effect_key LIKE ?", "status:#{order.id}:%:SendOrderStatusEmailJob").pick(:effect_key))
    2.times { Payments::DispatchOutbox.call(outbox: intent.reload) }
    expect(intent.reload.state).to eq('delivered')
    expect(PaymentOutbox.due).not_to include(intent)
    expect(EmailService).to have_received(:send_order_confirmed_email).once
  end

  it 'bootstraps an intent committed before setup began using its original operation' do
    attempt, order = fixture(raw_id: nil)
    provider = double('provider')
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    expect(provider).to receive(:setup) do |attempt:|
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      { raw_id: 'pi_bootstrap', flow: 'stripe_embedded', client_secret: 'fixture' }
    end
    expect(provider).to receive(:query) { |attempt:| result(attempt) }
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(order.reload.payment_status).to eq('paid')
  end

  it 'closes an expired never-dispatched intent without contacting a processor' do
    attempt, = fixture(raw_id: nil)
    attempt.checkout_session.update!(expires_at: 1.minute.ago)
    expect(Payments::ProviderResolver).not_to receive(:for_identity)
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('cancelled')
  end

  it 'surfaces manual restoration for legacy cancellation without guessing historical stock pools' do
    _, order, product = fixture
    order.update!(payment_status: 'paid', checkout_session_id: nil, payment_attempt_id: nil)
    Payments::UpdateOrder.call(order: order, attributes: { status: 'cancelled' }, user: nil)
    expect(order.reload.metadata.dig('inventory_restoration', 'status')).to eq('manual_review_required')
    expect(product.reload.product_stock_quantity).to eq(5)
  end

  it 'releases held stock when cancellation wins and compensates any late capture' do
    attempt, order, product = fixture
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    Payments::UpdateOrder.call(order: order, attributes: { status: 'cancelled' }, user: nil)
    expect(InventoryReservation.where(order_id: order.id, state: 'held')).to be_empty
    Payments::FinalizeOrder.call(attempt: attempt, result: result(attempt))
    expect(attempt.reload.state).to eq('compensation_required')
    expect(product.reload.product_stock_quantity).to eq(5)
    expect(InventoryCommitment.where(order_id: order.id)).to be_empty
  end

  it 'cancels expired dispatched collection only from authenticated cancellable proof' do
    attempt, order = fixture
    attempt.update!(state: 'collecting', dispatched_at: 1.hour.ago)
    attempt.checkout_session.update!(expires_at: 1.minute.ago)
    Payments::ReserveInventory.call(order: order, expires_at: 1.hour.from_now)
    provider = double('provider')
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:query).and_return(result(attempt, status: 'collecting', approved_cents: 0, captured_cents: 0, metadata: { cancellable: true }))
    expect(provider).to receive(:cancel) do
      expect(ActiveRecord::Base.connection.transaction_open?).to be false
      result(attempt, status: 'cancelled', approved_cents: 0, captured_cents: 0)
    end
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('cancelled')
    expect(InventoryReservation.where(order_id: order.id, state: 'held')).to be_empty
    expect(order.reload.payment_status).not_to eq('paid')
  end

  it 'backs off unknown money after its recovery deadline without cancelling or releasing it' do
    attempt, order = fixture
    attempt.update!(dispatched_at: 2.days.ago, recovery_deadline_at: 1.day.ago)
    provider = double('provider')
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:query).and_return(result(attempt, status: 'unknown', approved_cents: 0, captured_cents: 0))
    expect(provider).not_to receive(:cancel)
    Payments::ReconcileAttempt.call(attempt: attempt)
    expect(attempt.reload.error_classification).to eq('manual_reconciliation_required')
    expect(attempt.next_recovery_at).to be > 59.minutes.from_now
    expect(order.reload.payment_status).not_to eq('paid')
  end

  it 'persists notification failure backoff and stops automatic retries after ten attempts' do
    _, order = fixture
    row = PaymentOutbox.record!(effect_key: 'status:failure', kind: 'notification', payload: { 'job' => 'SendOrderStatusEmailJob', 'args' => [order.id, 'confirmed', 1] })
    allow_any_instance_of(SendOrderStatusEmailJob).to receive(:perform).and_raise(Payments::DeliverNotification::Retryable)
    expect { Payments::DispatchOutbox.call(outbox: row) }.to raise_error(Payments::DeliverNotification::Retryable)
    expect(row.reload.retry_count).to eq(1)
    expect(row.next_attempt_at).to be > 50.seconds.from_now
    row.update!(retry_count: 9, next_attempt_at: 1.second.ago)
    expect { Payments::DispatchOutbox.call(outbox: row) }.to raise_error(Payments::DeliverNotification::Retryable)
    expect(row.reload.state).to eq('manual_review_required')
    expect(PaymentOutbox.due).not_to include(row)
    expect { Payments::DispatchOutbox.call(outbox: row) }.not_to raise_error
  end

  it 'skips disabled admin SMS even when its transport is unconfigured' do
    _, order = fixture
    SiteSetting.instance.update!(enable_admin_sms: false)
    expect(SmsService).not_to receive(:sms_configured?)
    expect(Payments::AdminOrderSms.call(order)).to include(skipped: true)
  end

end
