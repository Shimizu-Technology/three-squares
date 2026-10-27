require 'rails_helper'
require 'timeout'

RSpec.describe 'Physical Stripe reader registration claims' do
  self.use_transactional_tests = false

  before do
    @threads, @release = [], Queue.new
    @dedicated = false
    name = ActiveRecord::Base.connection.select_value('SELECT current_database()')
    skip 'Requires a dedicated disposable test database' unless Rails.env.test? && name == ActiveRecord::Base.connection_db_config.database && name.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(name)
    @dedicated = true
    @identity = PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_concurrency_fixture', credential_reference: 'stripe_default', profile_key: SecureRandom.uuid)
    @location = create(:location)
    @user = create(:user, :admin)
    @profile = PaymentProfile.create!(payment_identity: @identity, provider: 'stripe', channel: 'pos', presentation: 'stripe_terminal', location: @location, enabled: true)
    @adapter = double(preflight: true)
    allow(@adapter).to receive(:pair) do |operation:, **|
      {status: 'succeeded', lane_id: operation.lane_id, terminal_id: operation.terminal_reference, connection_state: 'connected'}
    end
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider HTTP forbidden' }
  end

  after do
    @release << true
    @threads.each { |thread| thread.join(3) || thread.kill }
    if @dedicated
      connection = ActiveRecord::Base.connection
      connection.execute('TRUNCATE ' + (connection.tables - %w[schema_migrations ar_internal_metadata]).map { |t| connection.quote_table_name(t) }.join(', ') + ' RESTART IDENTITY CASCADE')
    end
  end

  def register(lane, started: nil)
    @threads << Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        started << connection.select_value('SELECT pg_backend_pid()') if started
        begin
          Payments::ManageTerminal.call(user: @user, profile: @profile, location: @location, lane_id: lane,
            terminal_reference: 'tmr_shared_fixture', label: 'Physical reader', operation_key: SecureRandom.uuid, kind: 'pair', adapter: @adapter)
        rescue Payments::Conflict => error
          error
        end
      end
    end
    @threads.last
  end

  it 'serializes different lane names on the same physical reader before creating either claim' do
    ready, started = Queue.new, Queue.new
    allow(TerminalAdministration).to receive(:create!).and_wrap_original do |original, **attributes|
      if attributes[:lane_id] == 'original'
        ready << true
        @release.pop
      end
      original.call(**attributes)
    end
    first = register('original')
    Timeout.timeout(10) { ready.pop }
    second = register('alias', started: started)
    pid = Timeout.timeout(10) { started.pop }
    Timeout.timeout(10) do
      loop do
        break if ActiveRecord::Base.connection.select_value("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = #{Integer(pid)} AND locktype = 'advisory' AND NOT granted)")
        sleep 0.01
      end
    end
    @release << true
    expect(first.join(5)).to be_present
    expect(second.join(5)).to be_present
    expect(first.value.state).to eq('succeeded')
    expect(second.value).to be_a(Payments::Conflict)
    expect(PaymentTerminal.count).to eq(1)
    expect(TerminalAdministration.count).to eq(1)
    expect(PaymentTerminal.first).to have_attributes(lane_id: 'original', stripe_reader_key: 'tmr_shared_fixture')
  end
end
