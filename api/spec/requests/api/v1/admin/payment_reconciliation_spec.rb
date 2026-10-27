require 'rails_helper'

RSpec.describe 'Payment reconciliation observations', type: :request do
  include ActiveSupport::Testing::TimeHelpers
  let(:owner) { create(:user, :owner) }
  let(:location) { create(:location, hours_json: { 'Daily' => '00:00-23:59' }) }
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'simulated', external_account_id: 'funding-fixture', credential_reference: 'simulation', profile_key: SecureRandom.uuid) }
  let(:product) { create(:product, product_type: 'local', allow_pickup: true, allow_shipping: false, inventory_level: 'product', product_stock_quantity: 20) }
  let(:variant) { create(:product_variant, product: product, price_cents: 1250) }
  let(:base) { '/api/v1/admin/payment_reconciliation' }
  let(:scope) { { identity_id: identity.id, environment: 'simulated' } }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'All provider traffic forbidden' }
    SiteSetting.instance.update!(payment_processor: 'worldpay', enable_storefront_three_squares: true)
    PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'online', presentation: 'worldpay_hosted_fields', enabled: true)
    ProductLocation.create!(product: product, location: location)
    acting(owner)
  end
  def acting(user)
    allow_any_instance_of(Api::V1::Admin::PaymentReconciliationController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::PaymentReconciliationController).to receive(:current_user).and_return(user)
  end
  def capture(scenario: 'approve')
    cart = CartItem.create!(session_id: SecureRandom.hex(20), product_variant: variant, quantity: 1)
    session = Payments::CreateCheckout.call(user: nil, capability: SecureRandom.hex(32), idempotency_key: SecureRandom.uuid,
      cart_items: [ cart ], attributes: { fulfillment_type: 'pickup', location_id: location.id, customer_name: 'Fixture', email: 'fixture@example.test' })
    attempt = session.payment_attempts.first
    Payments::SetupAttempt.call(attempt: attempt)
    result = Payments::ProviderResolver.for_attempt(attempt).collect(attempt: attempt, scenario: scenario, handle: attempt.reload.collection_config.fetch('client_secret'))
    Payments::FinalizeOrder.call(attempt: attempt, result: result)
    attempt.reload
  end
  def close(scenario: 'ordinary', key: SecureRandom.uuid, fee: 0)
    post "#{base}/simulate_close", params: scope.merge(scenario: scenario, lag_days: 2, fee_cents: fee), headers: { 'Idempotency-Key' => key }, as: :json
    expect(response).to have_http_status(:ok), response.body
    ReconciliationImport.find(response.parsed_body.fetch('id'))
  end
  def csv_import(text)
    post "#{base}/import", params: scope.merge(csv: text), headers: { 'Idempotency-Key' => SecureRandom.uuid }, as: :json
    expect(response).to have_http_status(:ok), response.body
  end
  def advance
    Payments::Reconciliation::SimulateClose.advance(identity: identity, user: owner, seconds: 3.days.to_i, operation_key: SecureRandom.uuid)
  end
  it 'recovers a combined close/import and advances accounting without changing either payment clock' do
    first, second = capture, capture
    key = SecureRandom.uuid
    saved = close(scenario: 'combined', key: key, fee: 25)
    expect(close(scenario: 'combined', key: key, fee: 25).id).to eq(saved.id)
    expect(SettlementBatch.count).to eq(2)
    expect(SettlementBatch.sum(:amount_cents)).to eq(2450)
    get "#{base}/simulated_funding", params: scope.merge(import_id: saved.id)
    expect(response).to have_http_status(:unprocessable_entity)
    identity_time = SimulationClock.for(identity).now
    times = [ first, second ].map { |a| [ a.simulation_offset_seconds, a.checkout_session.expires_at, a.next_recovery_at ] }
    advance_key = SecureRandom.uuid
    2.times do
      post "#{base}/advance_simulation", params: scope.merge(seconds: 3.days.to_i), headers: { 'Idempotency-Key' => advance_key }, as: :json
      expect(response).to have_http_status(:ok), response.body
    end
    expect(ReconciliationAudit.where(event: 'accounting_clock_advanced').count).to eq(1)
    expect(SimulationClock.for(identity).now).to eq(identity_time)
    expect([ first, second ].map { |a| [ a.reload.simulation_offset_seconds, a.checkout_session.expires_at, a.next_recovery_at ] }).to eq(times)
    get "#{base}/simulated_funding", params: scope.merge(import_id: saved.id)
    expect(response).to have_http_status(:ok), response.body
    csv = response.body
    2.times { csv_import(csv) }
    expect(FundingDeposit.count).to eq(1)
    expect(FundingAllocation.count).to eq(2)
    expect(FundingAllocation.sum(:amount_cents)).to eq(2450)
    get "#{base}/import_status", params: scope.merge(operation_key: key)
    expect(response.parsed_body.fetch('id')).to eq(saved.id)
    get base, params: scope
    expect(response.parsed_body.dig('report', 'totals', 'batch_net_cents')).to eq(2450)
    expect(Order.where(payment_status: 'paid').count).to eq(2)
    expect(InventoryCommitment.count).to eq(2)
    expect(product.reload.product_stock_quantity).to eq(18)
  end
  it 'puts later returns in a new batch and deduplicates split and duplicate funding exports' do
    attempt = capture
    first = close(scenario: 'split')
    expect(Payments::RefundPayment.call(order: attempt.order, amount_cents: 250, request_key: SecureRandom.uuid, admin_user: owner)[:success]).to be(true)
    second = close(scenario: 'duplicate')
    expect(SettlementBatch.order(:created_at).pluck(:amount_cents)).to eq([ 1250, -250 ])
    advance
    [ first, second ].each { |i| csv_import(Payments::Reconciliation::SimulateClose.funding_export(identity: identity, user: owner, import: i)) }
    expect(FundingDeposit.count).to eq(3)
    expect(FundingAllocation.sum(:amount_cents)).to eq(1000)
    expect(SettlementItem.where(entry_type: 'sale').count).to eq(1)
    capture
    missing = close(scenario: 'missing')
    get "#{base}/simulated_funding", params: scope.merge(import_id: missing.id)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch('error')).to include('Missing funding')
  end
  it 'voids the selected unbatched simulated capture once through common refund effects and rejects a closed sale' do
    attempt = capture
    key = SecureRandom.uuid
    2.times do
      post "#{base}/simulate_void", params: scope.merge(attempt_id: attempt.id), headers: { 'Idempotency-Key' => key }, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body.fetch('success')).to be(true)
    end
    expect(RefundOperation.where(kind: 'void', state: 'succeeded').count).to eq(1)
    expect(Refund.count).to eq(1)
    expect(product.reload.product_stock_quantity).to eq(19)
    close
    expect(SettlementBatch.sum(:amount_cents)).to eq(0)
    expect(SettlementItem.pluck(:entry_type)).to contain_exactly('sale', 'void')
    expect(ReconciliationException.count).to eq(0)
    other = capture
    close
    post "#{base}/simulate_void", params: scope.merge(attempt_id: other.id), headers: { 'Idempotency-Key' => SecureRandom.uuid }, as: :json
    expect(response.parsed_body.fetch('success')).to be(false)
    expect(RefundOperation.where(kind: 'void', state: 'failed').count).to eq(1)
    expect(other.order.reload.payment_status).to eq('paid')
  end
  it 'keeps an out-of-band refund observational and reviews it once without changing payment or stock' do
    attempt = capture
    close(scenario: 'external_refund')
    exception = ReconciliationException.find_by!(category: 'external_refund')
    review_key = SecureRandom.uuid
    2.times do
      post "#{base}/exceptions/#{exception.id}/review", params: scope.merge(reason: 'Compared with synthetic source'), headers: { 'Idempotency-Key' => review_key }, as: :json
      expect(response).to have_http_status(:ok), response.body
    end
    expect(ReconciliationAudit.where(event: 'exception_reviewed').count).to eq(1)
    expect(RefundOperation.count).to eq(0)
    expect(attempt.order.reload.payment_status).to eq('paid')
    expect(product.reload.product_stock_quantity).to eq(19)
  end
  it 'retains a mismatched deposit balance and binds manual decisions to the original actor, amount and reason' do
    capture
    saved = close(scenario: 'mismatch')
    advance
    csv_import(Payments::Reconciliation::SimulateClose.funding_export(identity: identity, user: owner, import: saved))
    expect(ReconciliationException.pluck(:category)).to include('unallocated_deposit')
    expect(FundingDeposit.sum(:amount_cents) - FundingAllocation.sum(:amount_cents)).to eq(17)
    batch, deposit = SettlementBatch.first, FundingDeposit.first
    post "#{base}/allocate", params: scope.merge(batch_id: batch.id, deposit_id: deposit.id, amount_cents: 17, reason: 'Cannot invent additional batch money'),
      headers: { 'Idempotency-Key' => SecureRandom.uuid }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch('rejected_before_operation')).to be(true)
    expect(FundingAllocation.count).to eq(1)
    # An unallocated source deposit can be matched manually by exact identifiers.
    other = capture
    close(scenario: 'missing')
    unallocated = { 'record_type' => 'deposit', 'external_id' => 'manual-deposit', 'amount_cents' => 1250, 'deposit_date' => '2026-10-30' }
    csv_import(Payments::Reconciliation::CanonicalCSV.dump(records: [ unallocated ], context: Payments::Reconciliation::Access.context(identity)))
    batch = SettlementBatch.order(:created_at).last
    deposit = FundingDeposit.find_by!(external_id: 'manual-deposit')
    key = SecureRandom.uuid
    payload = scope.merge(batch_id: batch.id, deposit_id: deposit.id, amount_cents: 1250, reason: 'Matched original batch and deposit references')
    2.times do
      post "#{base}/allocate", params: payload, headers: { 'Idempotency-Key' => key }, as: :json
      expect(response).to have_http_status(:ok), response.body
    end
    post "#{base}/allocate", params: payload.merge(reason: 'Changed decision'), headers: { 'Idempotency-Key' => key }, as: :json
    expect(response).to have_http_status(:conflict)
    expect(FundingAllocation.count).to eq(2)
    expect(other.order.reload.payment_status).to eq('paid')
    advance
    expect(ReconciliationException.where(category: 'missing_funding').count).to eq(0)
    capture
    close(scenario: 'missing')
    advance
    expect(ReconciliationException.where(category: 'missing_funding').count).to eq(1)
  end

  it 'keeps weekend deposit dates and production request guards separate from payment clocks' do
    capture
    include_time = Time.utc(2026, 10, 30, 2) # Friday in Guam; two-day release moves to Monday.
    ReconciliationTimeline.create!(payment_identity: identity, now: include_time)
    saved = close(scenario: 'weekend')
    plan = saved.source_parameters.fetch('funding')
    expect(plan.fetch('records').first.fetch('deposit_date')).to eq('2026-11-02')
    allow(ENV).to receive(:[]).with('APP_DEPLOYMENT_ENV').and_return('production')
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('false')
    allow(ENV).to receive(:[]).with('APP_MODE').and_return('production')
    # Configuration uses ENV.fetch for APP_MODE, so set that exact test observation too.
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with('APP_MODE', 'test').and_return('production')
    post "#{base}/advance_simulation", params: scope.merge(seconds: 60), headers: { 'Idempotency-Key' => SecureRandom.uuid }, as: :json
    expect(response).to have_http_status(:not_found)
    expect(ReconciliationTimeline.first.now).to eq(include_time)
  end
  it 'defaults to production and denies scoped roles and non-owner simulation' do
    capture
    close
    production = PaymentIdentity.create!(provider: 'worldpay', environment: 'production', external_account_id: 'account-production', external_acceptor_id: 'fixture-acceptor', credential_reference: 'fixture', profile_key: SecureRandom.uuid)
    get base
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch('accounts').map { |a| a.fetch('id') }).to eq([ production.id ])
    expect(response.parsed_body.dig('report', 'batches')).to be_empty
    get "#{base}/export", params: { identity_id: production.id }
    expect(response).to have_http_status(:unprocessable_entity)
    [ create(:user, :staff, assigned_location: location), create(:user, :manager, assigned_location: location), create(:user) ].each do |user|
      acting(user)
      get base
      expect(response).to have_http_status(:forbidden)
    end
    acting(create(:user, :manager))
    get base
    expect(response).to have_http_status(:ok)
    get base, params: scope
    expect(response).to have_http_status(:not_found)
    post "#{base}/advance_simulation", params: scope.merge(seconds: 60), headers: { 'Idempotency-Key' => SecureRandom.uuid }, as: :json
    expect(response).to have_http_status(:forbidden)
  end
  it 'retains durable invalid-file and balance refusals through status/replay and blocks changed payloads under their keys' do
    key = SecureRandom.uuid
    2.times do
      post "#{base}/import", params: scope.merge(csv: 'not-a-valid-file'), headers: { 'Idempotency-Key' => key }, as: :json
      expect(response).to have_http_status(:unprocessable_entity), response.body
      expect(response.parsed_body).to include('rejected_before_operation' => true, 'operation_key' => key)
    end
    expect(ReconciliationImport.count).to eq(0)
    get "#{base}/import_status", params: scope.merge(operation_key: key)
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include('state' => 'rejected', 'rejected_before_operation' => true, 'operation_key' => key)
    post "#{base}/import", params: scope.merge(csv: 'different-invalid-file'), headers: { 'Idempotency-Key' => key }, as: :json
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body).not_to have_key('rejected_before_operation')
    expect(RejectedPaymentRequest.count).to eq(1)
    whitespace = SecureRandom.uuid
    post "#{base}/import", params: scope.merge(csv: '   '), headers: { 'Idempotency-Key' => whitespace }, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.fetch('rejected_before_operation')).to be(true)
  end

  it 'preserves exact successful compensation evidence and excludes its partial approval once' do
    attempt = capture(scenario: 'partial')
    Payments::CompensateAttempt.call(attempt: attempt)
    close
    expect(ReconciliationException.count).to eq(0)
    expect(SettlementBatch.sum(:amount_cents)).to eq(0)
    expect(SettlementItem.where(entry_type: 'reversal').first).to have_attributes(
      transaction_id: attempt.reload.compensation_provider_id, amount_cents: 625, payment_transaction_id: attempt.payment_transaction.id)
    expect(InventoryCommitment.count).to eq(0)
  end

  it 'does not let a foreign one-cent mutation hide a fully compensated original transaction' do
    attempt = capture(scenario: 'partial')
    Payments::CompensateAttempt.call(attempt: attempt)
    time = Time.current
    day = time.in_time_zone('Pacific/Guam').to_date.iso8601
    records = [
      { 'record_type' => 'batch', 'external_id' => 'tainted-close', 'business_date' => day, 'provider_batch_date' => time.utc.to_date.iso8601,
        'amount_cents' => 0, 'sales_cents' => 0, 'returns_cents' => 0, 'fees_cents' => 0, 'adjustments_cents' => 0 },
      { 'record_type' => 'item', 'external_id' => 'observed-sale', 'batch_id' => 'tainted-close', 'transaction_id' => attempt.raw_provider_id,
        'entry_type' => 'sale', 'amount_cents' => 625, 'occurred_at' => time.iso8601, 'business_date' => day },
      { 'record_type' => 'item', 'external_id' => 'foreign-reversal', 'batch_id' => 'tainted-close', 'transaction_id' => 'unknown-mutation',
        'original_reference' => attempt.raw_provider_id, 'entry_type' => 'reversal', 'amount_cents' => 1, 'occurred_at' => time.iso8601, 'business_date' => day }
    ]
    csv_import(Payments::Reconciliation::CanonicalCSV.dump(records: records, context: Payments::Reconciliation::Access.context(identity)))
    expect(ReconciliationImport.last.state).to eq('conflicted')
    expect(ReconciliationException.pluck(:category)).to contain_exactly('unverified_reversal', 'batch_items_mismatch')
    expect(SettlementItem.find_by!(external_id: 'foreign-reversal').payment_transaction_id).to be_nil
  end

  it 'uses the explicit UTC synthetic provider date separately from the Guam transaction date' do
    travel_to(Time.utc(2026, 10, 27, 15)) do
      capture
      close
      expect(SettlementBatch.first.provider_batch_date.iso8601).to eq('2026-10-27')
      expect(SettlementBatch.first.business_date.iso8601).to eq('2026-10-28')
    end
  end
  it 'returns original-key no-operation proof when a saved void selection is stale after a full return' do
    attempt = capture
    expect(Payments::RefundPayment.call(order: attempt.order, amount_cents: 1250, request_key: SecureRandom.uuid, admin_user: owner)[:success]).to be(true)
    key = SecureRandom.uuid
    2.times do
      post "#{base}/simulate_void", params: scope.merge(attempt_id: attempt.id), headers: { 'Idempotency-Key' => key }, as: :json
      expect(response).to have_http_status(:unprocessable_entity), response.body
      expect(response.parsed_body).to include('status' => 'rejected', 'no_operation' => true, 'operation_key' => key, 'attempt_id' => attempt.id)
    end
    expect(RefundOperation.count).to eq(1)
    expect(RefundOperation.where(kind: 'void')).to be_empty
  end
end
