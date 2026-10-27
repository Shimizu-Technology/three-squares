require 'rails_helper'
require 'timeout'
require_relative '../../support/payment_foundation_helpers'

RSpec.describe 'Durable checkout creation decisions' do
  include PaymentFoundationHelpers
  self.use_transactional_tests = false

  before do
    @dedicated = false
    @threads = []
    @release = Queue.new
    c = ActiveRecord::Base.connection
    name = c.select_value('SELECT current_database()')
    skip 'Requires a dedicated disposable test database' unless Rails.env.test? && name == ActiveRecord::Base.connection_db_config.database && name.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(name)
    @dedicated = true
    configure_payment_fixture!
    @location = Location.create!(name: 'Decision fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' })
    @product = create(:product, published: true, inventory_level: 'variant', allow_pickup: true)
    @variant = create(:product_variant, product: @product, stock_quantity: 5, price_cents: 1250, available: true)
    @cart = CartItem.create!(session_id: SecureRandom.uuid, product_variant: @variant, quantity: 1)
    @attrs = { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: @location.id }
  end

  after do
    @release << true
    @threads.each { |thread| thread.join(3) || thread.kill }
    if @dedicated
      c = ActiveRecord::Base.connection
      c.execute('TRUNCATE ' + (c.tables - %w[schema_migrations ar_internal_metadata]).map { |t| c.quote_table_name(t) }.join(', ') + ' RESTART IDENTITY CASCADE')
    end
  end

  def create_request
    Payments::CreateCheckout.call(user: nil, capability: @capability, idempotency_key: @request_key,
      cart_items: [ CartItem.includes(product_variant: { product: [ :product_locations, :collections ] }).find(@cart.id) ], attributes: @attrs)
  end

  def start_request(role, started: nil)
    @threads << Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        Thread.current[:decision_role] = role
        started << connection.select_value('SELECT pg_backend_pid()') if started
        begin
          create_request
        rescue Payments::CheckoutRejected => error
          error
        end
      end
    end
    @threads.last
  end

  def wait_for_lock(pid)
    200.times do
      return if ActiveRecord::Base.connection.select_value("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = #{Integer(pid)} AND locktype = 'advisory' AND NOT granted)")
      sleep 0.01
    end
    raise 'Replay did not wait for the original owner/key decision'
  end

  def take(queue)
    Timeout.timeout(10) { queue.pop }
  end

  it 'makes a replay wait for the original committed intent before revalidating closing-time eligibility' do
    ready = Queue.new
    started = Queue.new
    allow(Payments::Eligibility).to receive(:validate!).and_wrap_original do |original, **args|
      raise Payments::FulfillmentError, 'Closed after original review' if Thread.current[:decision_role] == :replay
      original.call(**args)
      ready << true
      @release.pop
    end
    original = start_request(:original)
    take(ready)
    replay = start_request(:replay, started: started)
    wait_for_lock(take(started))
    @release << true
    expect(original.join(5)).to be_present
    expect(replay.join(5)).to be_present
    expect(replay.value.id).to eq(original.value.id)
    expect(CheckoutSession.count).to eq(1)
    expect(CheckoutRequest.first.outcome).to eq('accepted')
    expect(Order.count).to eq(1)
    expect(PaymentAttempt.count).to eq(1)
  end

  it 'durably rejects the key before a queued original request can create setup after abandonment' do
    ready = Queue.new
    started = Queue.new
    allow(Payments::Eligibility).to receive(:validate!) do |**|
      raise 'A rejected key was revalidated' if Thread.current[:decision_role] == :queued_original
      ready << true
      @release.pop
      raise Payments::FulfillmentError, 'Fixture unavailable'
    end
    rejection = start_request(:rejection)
    take(ready)
    original = start_request(:queued_original, started: started)
    wait_for_lock(take(started))
    @release << true
    expect(rejection.join(5)).to be_present
    expect(original.join(5)).to be_present
    expect(rejection.value).to be_a(Payments::CheckoutRejected)
    expect(original.value).to be_a(Payments::CheckoutRejected)
    expect(CheckoutRequest.first.outcome).to eq('rejected')
    expect(CheckoutSession.count).to eq(0)
    expect(PaymentAttempt.count).to eq(0)
    expect(Order.count).to eq(0)
    allow(Payments::Eligibility).to receive(:validate!).and_call_original
    expect { create_request }.to raise_error(Payments::CheckoutRejected)
  end
end
