require 'rails_helper'
require 'timeout'

RSpec.describe 'Order number concurrency', type: :model do
  include ActiveSupport::Testing::TimeHelpers
  self.use_transactional_tests = false

  before do
    @dedicated = false
    @threads = []
    @release = Queue.new
    name = ActiveRecord::Base.connection.select_value('SELECT current_database()')
    skip 'Requires a dedicated disposable test database' unless Rails.env.test? && name == ActiveRecord::Base.connection_db_config.database && name.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(name)
    @dedicated = true
    travel_to Time.utc(2026, 10, 28, 2)
  end

  after do
    24.times { @release << true }
    @threads.each { |thread| thread.join(3) || thread.kill.join }
    travel_back
    if @dedicated
      c = ActiveRecord::Base.connection
      c.execute('TRUNCATE ' + (c.tables - %w[schema_migrations ar_internal_metadata]).map { |t| c.quote_table_name(t) }.join(', ') + ' RESTART IDENTITY CASCADE')
    end
  end

  def attrs(**overrides)
    { source: 'online', order_type: 'retail', fulfillment_type: 'shipping', status: 'pending', payment_status: 'pending', customer_email: 'fixture@example.test', total_cents: 100 }.merge(overrides)
  end

  def start_worker(&block)
    @threads << Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        connection.execute("SET statement_timeout = '10s'")
        block.call(connection)
      ensure
        connection.execute('RESET statement_timeout')
      end
    end
    @threads.last
  end

  def take(queue)
    Timeout.timeout(15) { queue.pop }
  end

  def wait_for_number_lock(pid)
    Timeout.timeout(10) do
      until ActiveRecord::Base.connection.select_value("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = #{Integer(pid)} AND locktype = 'advisory' AND classid = 5526353 AND NOT granted)")
        sleep 0.01
      end
    end
  end

  [ [ 'P', { source: 'pos' } ], [ 'R', {} ], [ 'W', { order_type: 'wholesale' } ] ].each do |type, overrides|
    it "commits 24 concurrent #{type} orders with unique contiguous numbers" do
      # Start outside the pool: CI's smaller pool still runs overlapping saves,
      # while a larger local pool exercises all 24 database connections at once.
      ready = Queue.new
      workers = 24.times.map do
        @threads << Thread.new do
          ready << true
          @release.pop
          ActiveRecord::Base.connection_pool.with_connection { Order.create!(attrs(**overrides)).order_number }
        end
        @threads.last
      end
      24.times { take(ready) }
      24.times { @release << true }
      numbers = Timeout.timeout(30) { workers.map(&:value) }
      expect(numbers.sort).to eq((1..24).map { |n| "TSQ-#{type}-20261028-#{n.to_s.rjust(4, '0')}" })
      expect(Order.count).to eq(24)
    end
  end

  [ false, true ].each do |rollback|
    it "holds the number lock beyond save until outer #{rollback ? 'rollback' : 'commit'}" do
      ready = Queue.new
      started = Queue.new
      original = start_worker do
        Order.transaction do
          order = Order.create!(attrs)
          ready << order.order_number
          @release.pop
          raise ActiveRecord::Rollback if rollback
        end
      end
      expect(take(ready)).to eq('TSQ-R-20261028-0001')
      contender = start_worker do |connection|
        started << connection.select_value('SELECT pg_backend_pid()')
        Order.create!(attrs).order_number
      end
      wait_for_number_lock(take(started))
      @release << true
      Timeout.timeout(15) { original.value }
      expect(Timeout.timeout(15) { contender.value }).to eq("TSQ-R-20261028-#{rollback ? '0001' : '0002'}")
      expect(Order.count).to eq(rollback ? 1 : 2)
    end
  end

  it 'does not block a different prefix behind an open transaction' do
    ready = Queue.new
    owner = start_worker do
      Order.transaction do
        Order.create!(attrs(source: 'pos'))
        ready << true
        @release.pop
      end
    end
    take(ready)
    independent = start_worker { Order.create!(attrs).order_number }
    expect(Timeout.timeout(5) { independent.value }).to eq('TSQ-R-20261028-0001')
    @release << true
    Timeout.timeout(15) { owner.value }
  end
end
