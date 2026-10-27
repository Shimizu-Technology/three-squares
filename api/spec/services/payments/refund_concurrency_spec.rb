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

  before { @fixture = captured_order }
  after do
    order, identity, attempt = @fixture
    operations = RefundOperation.where(order_id: order.id)
    RefundEffect.where(refund_operation_id: operations.select(:id)).delete_all
    RefundObservation.where(refund_operation_id: operations.select(:id)).delete_all
    Refund.where(order_id: order.id).delete_all
    operations.delete_all
    PaymentTransaction.where(order_id: order.id).delete_all
    Order.where(id: order.id).update_all(checkout_session_id: nil, payment_attempt_id: nil)
    PaymentAttempt.where(id: attempt.id).delete_all
    CheckoutSession.where(order_id: order.id).delete_all
    Order.where(id: order.id).delete_all
    PaymentIdentity.where(id: identity.id).delete_all
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
end
