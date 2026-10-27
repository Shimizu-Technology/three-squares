require "rails_helper"
require_relative "../../support/refund_fixtures"

RSpec.describe Payments::RefundPayment do
  include RefundFixtures
  let(:fixture) { captured_order }
  let(:order) { fixture.first }
  let(:provider) { double("identity-bound provider") }
  before do
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:refund).and_return(raw_id: "re_fixture", status: "succeeded", amount_cents: 500)
  end

  def refund(key: "request-1", amount: 500, **args)
    described_class.new.call(order: order, amount_cents: amount, request_key: key, **args)
  end

  it "returns the original full refund on retry even after order becomes refunded" do
    allow(provider).to receive(:refund).and_return(raw_id: "re_full", status: "succeeded", amount_cents: 1500)
    first = refund(amount: 1500)
    expect(first).to include(success: true, status: "succeeded")
    second = refund(amount: 1500)
    expect(second[:refund].id).to eq(first[:refund].id)
    expect(order.reload.payment_status).to eq("refunded")
    expect(provider).to have_received(:refund).once
    expect(RefundEffect.count).to eq(1)
  end

  it "returns 409 for a reused key with a changed amount, kind, reason or restock decision" do
    refund
    [ { amount: 501 }, { reason: "changed" }, { restoration_request: { restock_items: true } } ].each do |change|
      expect(refund(**change)).to include(success: false, http_status: 409)
    end
    expect(refund(kind: "void")).to include(success: false, http_status: 409)
    expect(provider).to have_received(:refund).once
  end

  it "retains a timed-out reservation across new instances and queries by frozen operation UUID" do
    allow(provider).to receive(:refund).and_raise(Timeout::Error)
    first = refund(amount: 1200)
    operation = first[:refund].refund_operation
    expect(first).to include(success: false, status: "unknown", http_status: 202)
    expect(refund(amount: 1200)[:refund].id).to eq(first[:refund].id)
    expect(refund(key: "another", amount: 301)).to include(http_status: 409)
    expect(provider).to have_received(:refund).once
    expect(RefundEffect.count).to eq(0)
    expect(provider).to receive(:query_refund).with(reference: nil, operation_key: operation.operation_key)
      .and_return(raw_id: "re_recovered", status: "succeeded", amount_cents: 1200)
    expect(described_class.new.reconcile(operation: RefundOperation.find(operation.id))).to include(success: true)
    expect(RefundEffect.count).to eq(1)
    expect(refund(key: "after-recovery", amount: 301)).to include(http_status: 409)
  end

  it "dispatches a frozen operation key/reference and uses original identity despite settings and test_mode" do
    identity, attempt = fixture[1, 2]
    SiteSetting.instance.update!(payment_processor: "worldpay", payment_test_mode: true)
    expect(Payments::ProviderResolver).to receive(:for_identity).with(have_attributes(id: identity.id)).and_return(provider)
    expect(provider).to receive(:refund) do |**params|
      operation = RefundOperation.find_by!(order_id: order.id)
      expect(params).to include(reference: fixture[3].raw_provider_id, operation_key: operation.operation_key,
        attempt: attempt, amount_cents: 500)
      { raw_id: "re_original", status: "succeeded", amount_cents: 500 }
    end
    expect(PaymentService.refund_payment(order: order, amount_cents: 500, request_key: "original", test_mode: true)).to include(success: true)
    expect(RefundOperation.last).to have_attributes(payment_identity_id: identity.id, provider: "stripe", environment: "sandbox")
  end

  it "never simulates a production record or accepts an unverified legacy identity" do
    legacy = create(:order, payment_status: "paid", payment_method: "stripe", payment_intent_id: "pi_live_example")
    expect(PaymentService.refund_payment(order: legacy, amount_cents: 500, request_key: "legacy", test_mode: true))
      .to include(success: false, status: "reconciliation_required")
    production_order = captured_order(environment: "production").first
    expect(PaymentService.refund_payment(order: production_order, amount_cents: 500, request_key: "live", test_mode: true))
      .to include(success: false, status: "reconciliation_required")
    expect(provider).not_to have_received(:refund)
    expect(RefundOperation.count).to eq(0)
  end

  it "reserves historical succeeded AND pending refunds before allowing another request" do
    Refund.create!(order: order, amount_cents: 600, status: "succeeded")
    Refund.create!(order: order, amount_cents: 500, status: "pending")
    expect(refund(amount: 401)).to include(http_status: 409)
    expect(provider).not_to have_received(:refund)
  end

  it "requires positive integer cents and a caller request key" do
    [ 0, -1, 1.1, "500" ].each { |amount| expect(refund(amount: amount)).to include(success: false) }
    expect(refund(key: nil)).to include(success: false)
    expect(provider).not_to have_received(:refund)
  end

  it "preserves cash refunds without processor calls with durable audit and idempotency" do
    cash = create(:order, payment_method: "cash", payment_status: "paid", payment_environment: "sandbox")
    args = { order: cash, amount_cents: 1500, request_key: "cash-full", reason: "Cash returned" }
    first = described_class.call(**args)
    expect(first).to include(success: true)
    expect(described_class.call(**args)[:refund].id).to eq(first[:refund].id)
    expect(cash.reload.payment_status).to eq("refunded")
    expect(first[:refund].refund_operation).to have_attributes(provider: "cash", original_reference: "cash:#{cash.id}")
    expect(provider).not_to have_received(:refund)
  end

  it "authenticates a verified mapped legacy capture before recording the original evidence" do
    identity = fixture[1]
    legacy = create(:order, payment_status: "paid", payment_method: "stripe", payment_identity_id: identity.id, payment_intent_id: "ch_legacy")
    expect(provider).to receive(:query_original_charge).with(reference: "ch_legacy")
      .and_return(identity_id: identity.id, raw_id: "ch_legacy", status: "captured", amount_cents: 1500, currency: "USD")
    expect(provider).to receive(:refund).with(hash_including(attempt: nil, reference: "ch_legacy")).and_return(raw_id: "re_legacy", status: "succeeded", amount_cents: 500)
    result = described_class.call(order: legacy, amount_cents: 500, request_key: "legacy-mapped")
    expect(result).to include(success: true)
    expect(result[:refund].refund_operation).to have_attributes(original_reference: "ch_legacy", captured_cents: 1500, payment_attempt_id: nil)
  end

  it "does not accept a mismatched or uncaptured legacy query" do
    identity = fixture[1]
    legacy = create(:order, payment_status: "paid", payment_method: "stripe", payment_identity_id: identity.id, payment_intent_id: "pi_unverified")
    allow(provider).to receive(:query_original_charge).and_return(identity_id: identity.id, raw_id: "pi_unverified", status: "pending", amount_cents: 1500, currency: "USD")
    expect(described_class.call(order: legacy, amount_cents: 500, request_key: "uncaptured")).to include(success: false)
    expect(provider).not_to have_received(:refund)
  end
end
