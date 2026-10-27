require "rails_helper"
require "timeout"
require_relative "../../support/refund_fixtures"

RSpec.describe "Refund database concurrency" do
  self.use_transactional_tests = false
  include RefundFixtures

  def race
    ready, gate = Queue.new, Queue.new
    threads = 2.times.map do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          gate.pop
          yield index
        end
      end
    end
    Timeout.timeout(10) { 2.times { ready.pop } }
    2.times { gate << true }
    Timeout.timeout(10) { threads.map(&:value) }
  ensure
    threads&.each { |thread| thread.join(1) }
  end

  before do
    configured = ActiveRecord::Base.connection_db_config.database
    actual = ActiveRecord::Base.connection.select_value('SELECT current_database()')
    raise 'Dedicated test DB required' unless Rails.env.test? && actual == configured && actual.end_with?('_test') && !%w[three_squares_test three_squares_development].include?(actual)
    @dedicated_database_verified = true
    @fixture = captured_order
  end
  after do
    next unless @dedicated_database_verified
    connection = ActiveRecord::Base.connection
    tables = connection.tables - %w[schema_migrations ar_internal_metadata]
    connection.execute("TRUNCATE #{tables.map { |name| connection.quote_table_name(name) }.join(', ')} RESTART IDENTITY CASCADE")
  end

  it "serializes distinct keys so succeeded plus pending/unknown can never overreserve captured cents" do
    results = race do |index|
      begin
        Payments::ReserveRefund.call(order: Order.find(@fixture.first.id), amount_cents: 1000, request_key: "race-#{index}")
        :reserved
      rescue Payments::Conflict
        :rejected
      end
    end
    expect(results.sort).to eq([ :rejected, :reserved ])
    expect(RefundOperation.holding.sum(:amount_cents)).to eq(1000)
  end

  it "deduplicates concurrent same-key submissions and permits exactly one dispatch" do
    calls = Queue.new
    provider = Object.new
    provider.define_singleton_method(:refund) do |**args|
      calls << args
      { raw_id: "re_concurrent", status: "pending", amount_cents: 500 }
    end
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    results = race do |_index|
      Payments::RefundPayment.call(order: Order.find(@fixture.first.id), amount_cents: 500, request_key: "same-key")
    end
    expect(results.map { |result| result[:refund].id }.uniq.length).to eq(1)
    expect(calls.size).to eq(1)
    expect(RefundOperation.count).to eq(1)
  end

  it "releases session, attempt, charge and order locks before the provider mutation" do
    order, _identity, attempt, charge = @fixture
    provider = Object.new
    provider.define_singleton_method(:refund) do |**_args|
      # A different physical connection can acquire every lock while SDK is in flight.
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ApplicationRecord.transaction do
            CheckoutSession.lock("FOR UPDATE NOWAIT").find(attempt.checkout_session_id)
            PaymentAttempt.lock("FOR UPDATE NOWAIT").find(attempt.id)
            PaymentTransaction.lock("FOR UPDATE NOWAIT").find(charge.id)
            Order.lock("FOR UPDATE NOWAIT").find(order.id)
          end
        end
      end.value
      { raw_id: "re_unlocked", status: "succeeded", amount_cents: 500 }
    end
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    result = Payments::RefundPayment.call(order: order, amount_cents: 500, request_key: "unlocked")
    expect(result).to include(success: true)
  end
  it 'serializes a confirmed refund restoration against cancellation without adding the same units twice' do
    order = @fixture.first
    product = create(:product, inventory_level: 'variant')
    variant = create(:product_variant, product: product, stock_quantity: 5)
    create(:order_item, order: order, product: product, product_variant: variant, quantity: 2, unit_price_cents: 500)
    Order.transaction { Order.lock.find(order.id); Payments::ReserveInventory.commit!(order: order, snapshot_digest: 'snapshot') }
    provider = Object.new
    provider.define_singleton_method(:refund) { |**| { raw_id: 're_stock_race', status: 'succeeded', amount_cents: 500 } }
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    race do |index|
      current = Order.find(order.id)
      if index.zero?
        Payments::RefundPayment.call(order: current, amount_cents: 500, request_key: 'stock-race', restoration_request: { restock_items: true })
      else
        Payments::UpdateOrder.call(order: current, attributes: { status: 'cancelled' }, user: nil)
      end
    end
    expect(variant.reload.stock_quantity).to eq(5)
    expect(order.reload.status).to eq('cancelled')
    expect(InventoryReservation.find_by!(order_id: order.id).restored_quantities.values.sum).to eq(2)
    expect(RefundOperation.count).to eq(1)
  end

  it 'claims a verified legacy capture for one order across simultaneous foreign-order refund requests' do
    identity = @fixture[1]
    orders = 2.times.map { create(:order, payment_status: 'paid', payment_method: 'stripe', payment_identity_id: identity.id, payment_intent_id: 'pi_sharedLegacy') }
    calls = Queue.new
    provider = Object.new
    provider.define_singleton_method(:query_original_charge) do |**|
      { identity_id: identity.id, raw_id: 'pi_sharedLegacy', status: 'captured', amount_cents: 1500, currency: 'USD' }
    end
    provider.define_singleton_method(:refund) do |**args|
      calls << args
      { raw_id: 're_legacyOwner', status: 'pending', amount_cents: 500 }
    end
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    results = race { |index| Payments::RefundPayment.call(order: orders[index], amount_cents: 500, request_key: "legacy-#{index}") }
    expect(results.map { |result| result[:status] }.sort).to eq(%w[pending rejected])
    expect(calls.size).to eq(1)
    expect(LegacyCaptureBinding.count).to eq(1)
    expect(LegacyCaptureBinding.last.order_id).to eq(RefundOperation.last.order_id)
  end

end
