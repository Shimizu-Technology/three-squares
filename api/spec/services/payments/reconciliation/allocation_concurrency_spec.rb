require 'rails_helper'
require 'timeout'

RSpec.describe 'Concurrent accounting observations' do
  self.use_transactional_tests = false
  before do
    @dedicated = false
    @threads, @release = [], Queue.new
    connection = ActiveRecord::Base.connection
    name = connection.select_value('SELECT current_database()')
    skip 'Requires a dedicated disposable test database' unless Rails.env.test? && name == ActiveRecord::Base.connection_db_config.database && name.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(name)
    @dedicated = true
    @user = create(:user, :owner)
    @identity = PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'concurrent-accounting', credential_reference: 'fixture', profile_key: SecureRandom.uuid)
    rows = [
      { 'record_type' => 'batch', 'external_id' => 'batch', 'amount_cents' => 1000, 'sales_cents' => 0, 'returns_cents' => 0, 'fees_cents' => 0, 'adjustments_cents' => 1000, 'business_date' => '2026-10-28', 'provider_batch_date' => '2026-10-27' },
      { 'record_type' => 'item', 'external_id' => 'adjustment', 'batch_id' => 'batch', 'entry_type' => 'adjustment', 'amount_cents' => 1000, 'occurred_at' => '2026-10-27T14:30:00Z', 'business_date' => '2026-10-28' },
      { 'record_type' => 'deposit', 'external_id' => 'deposit', 'amount_cents' => 1000, 'deposit_date' => '2026-10-30' }
    ]
    @input = Payments::Reconciliation::CanonicalCSV.dump(records: rows, context: Payments::Reconciliation::Access.context(@identity))
    Payments::Reconciliation::Import.call(identity: @identity, user: @user, input: @input, operation_key: 'original-import')
    @batch, @deposit = SettlementBatch.first, FundingDeposit.first
  end
  after do
    @threads.size.times { @release << true }
    @threads.each { |thread| thread.join(3) || thread.kill }
    if @dedicated
      connection = ActiveRecord::Base.connection
      connection.execute('TRUNCATE ' + (connection.tables - %w[schema_migrations ar_internal_metadata]).map { |t| connection.quote_table_name(t) }.join(', ') + ' RESTART IDENTITY CASCADE')
    end
  end
  def race(*actions)
    ready = Queue.new
    @threads = actions.map do |action|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          @release.pop
          begin
            action.call
          rescue Payments::Conflict => error
            error
          end
        end
      end
    end
    actions.size.times { Timeout.timeout(10) { ready.pop } }
    actions.size.times { @release << true }
    @threads.map { |t| Timeout.timeout(10) { t.value } }
  end
  def allocate(key, amount = 700)
    Payments::Reconciliation::Allocate.call(identity: @identity, user: @user, batch: @batch, deposit: @deposit,
      amount_cents: amount, operation_key: key, reason: 'Reviewed exact source identifiers')
  end
  it 'serializes competing allocations so only one can consume the available balance' do
    results = race(-> { allocate('one') }, -> { allocate('two') })
    expect(results.count { |r| r.is_a?(FundingAllocation) }).to eq(1)
    expect(results.count { |r| r.is_a?(Payments::Conflict) }).to eq(1)
    expect(FundingAllocation.sum(:amount_cents)).to eq(700)
    expect(ReconciliationAudit.where(event: 'allocated').count).to eq(1)
  end
  it 'deduplicates identical concurrent mutations and import replays without a second audit' do
    results = race(-> { allocate('same-key') }, -> { allocate('same-key') })
    expect(results.map(&:id).uniq.size).to eq(1)
    expect(FundingAllocation.count).to eq(1)
    results = race(*2.times.map { -> { Payments::Reconciliation::Import.call(identity: @identity, user: @user, input: @input, operation_key: 'replayed-import') } })
    expect(results.map(&:id).uniq.size).to eq(1)
    expect(SettlementBatch.count).to eq(1)
    expect(ReconciliationAudit.where(event: 'imported').count).to eq(2)
  end
  it 'serializes and durably fences repeated invalid imports before a corrected request can reuse their key' do
    results = race(*2.times.map { -> { Payments::Reconciliation::Import.call(identity: @identity, user: @user, input: 'invalid CSV', operation_key: 'refused-import') } })
    expect(results).to all(be_a(Payments::Reconciliation::RequestDecision::Rejected))
    expect(RejectedPaymentRequest.count).to eq(1)
    expect(ReconciliationImport.count).to eq(1)
    expect { Payments::Reconciliation::Import.call(identity: @identity, user: @user, input: @input, operation_key: 'refused-import') }.to raise_error(Payments::Conflict)
    expect(ReconciliationImport.count).to eq(1)
  end
end
