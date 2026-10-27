require 'rails_helper'

RSpec.describe Payments::Reconciliation::Import do
  let(:user) { create(:user, :admin) }
  let(:identity) { PaymentIdentity.create!(provider: 'stripe', environment: 'simulated', external_account_id: 'account-0007', credential_reference: 'simulation', profile_key: SecureRandom.uuid) }
  let(:context) { Payments::Reconciliation::Access.context(identity) }
  let(:key) { SecureRandom.uuid }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider traffic forbidden' }
  end
  def batch(id, amount = 1000)
    { 'record_type' => 'batch', 'external_id' => id, 'business_date' => '2026-10-28', 'provider_batch_date' => '2026-10-27',
      'amount_cents' => amount, 'sales_cents' => amount, 'returns_cents' => 0, 'fees_cents' => 0, 'adjustments_cents' => 0 }
  end
  def sale(id, batch_id, amount = 1000)
    order = create(:order, payment_identity_id: identity.id, simulated: true, payment_environment: 'simulated', total_cents: amount)
    LegacyCaptureBinding.create!(order: order, payment_identity: identity, provider: identity.provider, environment: identity.environment,
      external_account_id: identity.external_account_id, consumption_reference: id, original_reference: id, amount_cents: amount, currency: 'USD', verified_at: Time.current)
    { 'record_type' => 'item', 'external_id' => "item-#{id}", 'batch_id' => batch_id, 'transaction_id' => id,
      'entry_type' => 'sale', 'amount_cents' => amount, 'occurred_at' => '2026-10-27T14:30:00Z', 'business_date' => '2026-10-28' }
  end
  def deposit(id, amount = 1000)
    { 'record_type' => 'deposit', 'external_id' => id, 'amount_cents' => amount, 'deposit_date' => '2026-10-30' }
  end
  def allocation(id, batch_id, deposit_id, amount = 1000)
    { 'record_type' => 'allocation', 'external_id' => id, 'batch_id' => batch_id, 'deposit_id' => deposit_id, 'amount_cents' => amount }
  end
  def import(records, request_key = key)
    described_class.call(identity: identity, user: user, operation_key: request_key,
      input: Payments::Reconciliation::CanonicalCSV.dump(records: records, context: context))
  end
  it 'imports combined and split deposits through exact identifiers with three distinct dates and one audit per mutation' do
    rows = [ batch('b1'), sale('s1', 'b1'), batch('b2', 500), sale('s2', 'b2', 500),
      deposit('d1', 1200), deposit('d2', 300), allocation('a1', 'b1', 'd1'), allocation('a2', 'b2', 'd1', 200), allocation('a3', 'b2', 'd2', 300) ]
    result = import(rows)
    expect(result.state).to eq('succeeded')
    expect(SettlementBatch.count).to eq(2)
    expect(SettlementItem.count).to eq(2)
    expect(FundingAllocation.sum(:amount_cents)).to eq(1500)
    expect(SettlementBatch.first.business_date.iso8601).to eq('2026-10-28')
    expect(SettlementBatch.first.provider_batch_date.iso8601).to eq('2026-10-27')
    expect(FundingDeposit.first.deposit_date.iso8601).to eq('2026-10-30')
    expect(ReconciliationAudit.count).to eq(4)
    expect(import(rows).id).to eq(result.id)
    expect(ReconciliationAudit.count).to eq(4)
    expect(import(rows, SecureRandom.uuid).state).to eq('succeeded')
    expect(FundingAllocation.count).to eq(3)
  end
  it 'keeps conflicting identifiers and late membership as exceptions without rewriting the closed batch' do
    import([ batch('b1'), sale('s1', 'b1') ])
    late = sale('s2', 'b1')
    result = import([ batch('b1', 2000), late ], SecureRandom.uuid)
    expect(result.state).to eq('conflicted')
    expect(SettlementBatch.first.amount_cents).to eq(1000)
    expect(SettlementItem.count).to eq(1)
    expect(ReconciliationException.pluck(:category)).to contain_exactly('conflicting_source_record', 'closed_batch_membership')
  end
  it 'records an out-of-band refund without creating financial refund authority or changing stock/order state' do
    row = { 'record_type' => 'item', 'external_id' => 'portal-return', 'batch_id' => 'b1', 'transaction_id' => 'unassigned-return',
      'original_reference' => 's1', 'entry_type' => 'return', 'amount_cents' => 200,
      'occurred_at' => '2026-10-27T15:00:00Z', 'business_date' => '2026-10-28' }
    header = batch('b1').merge('amount_cents' => 800, 'returns_cents' => 200)
    result = import([ header, sale('s1', 'b1'), row ])
    expect(result.state).to eq('conflicted')
    expect(ReconciliationException.pluck(:category)).to include('external_refund')
    expect(RefundOperation.count).to eq(0)
    expect(Refund.count).to eq(0)
    expect(InventoryCommitment.count).to eq(0)
    expect(Order.first.payment_status).to eq('pending')
  end
  it 'rejects over-allocation and missing identifiers without guessing by amounts' do
    rows = [ batch('b1'), sale('s1', 'b1'), deposit('d1', 500), allocation('too-much', 'b1', 'd1'), allocation('missing', 'b2', 'd1', 500) ]
    expect(import(rows).state).to eq('conflicted')
    expect(FundingAllocation.count).to eq(0)
    expect(ReconciliationException.pluck(:category)).to contain_exactly('allocation_conflict', 'unmatched_allocation')
  end
  it 'allocates a combined credit and debit deposit atomically regardless of row order' do
    debit = batch('debit', 0).merge('amount_cents' => -1000, 'adjustments_cents' => -1000)
    adjustment = { 'record_type' => 'item', 'external_id' => 'adjustment', 'batch_id' => 'debit', 'entry_type' => 'adjustment',
      'amount_cents' => -1000, 'occurred_at' => '2026-10-27T14:30:00Z', 'business_date' => '2026-10-28' }
    rows = [ batch('credit', 2000), sale('s1', 'credit', 2000), debit, adjustment, deposit('combined', 1000),
      allocation('credit-allocation', 'credit', 'combined', 2000), allocation('debit-allocation', 'debit', 'combined', -1000) ]
    expect(import(rows).state).to eq('succeeded')
    expect(FundingAllocation.sum(:amount_cents)).to eq(1000)
    expect(import(rows.reverse, SecureRandom.uuid).state).to eq('succeeded')
    expect(FundingAllocation.count).to eq(2)
  end
  it 'rejects a reused import key or foreign context before creating a second outcome' do
    rows = [ batch('b1'), sale('s1', 'b1') ]
    import(rows)
    expect { import([ deposit('different') ]) }.to raise_error(Payments::Conflict)
    foreign = Payments::Reconciliation::CanonicalCSV.dump(records: [ deposit('different') ], context: context.merge('account_id' => 'other'))
    expect { described_class.call(identity: identity, user: user, operation_key: SecureRandom.uuid, input: foreign) }.to raise_error(Payments::Reconciliation::CanonicalCSV::Invalid)
    expect(ReconciliationImport.count).to eq(1)
  end
  it 'requires whole-account manager access and denies managers the owner-only simulation view' do
    scoped = create(:user, role: 'manager', assigned_location: create(:location))
    expect { described_class.call(identity: identity, user: scoped, operation_key: key, input: 'anything') }.to raise_error(Payments::BindingError)
    manager = create(:user, role: 'manager')
    expect { described_class.call(identity: identity, user: manager, operation_key: key, input: 'anything') }.to raise_error(Payments::BindingError)
  end
end
