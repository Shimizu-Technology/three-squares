require "rails_helper"
require_relative "../../support/refund_fixtures"

RSpec.describe Payments::ApplyPaymentEvent do
  include RefundFixtures
  let(:fixture) { captured_order }
  let(:operation) { Payments::ReserveRefund.call(order: fixture.first, amount_cents: 500, request_key: "event") }

  def observe(status, key: SecureRandom.uuid, **changes)
    described_class.call(operation: operation, event_key: key, status: status, raw_id: "re_event",
      amount_cents: 500, identity_id: fixture[1].id, original_reference: fixture[3].raw_provider_id, **changes)
  end

  it "deduplicates events and never regresses a successful operation or its financial projection" do
    observe("succeeded", key: "success")
    observe("succeeded", key: "success")
    observe("pending")
    observe("failed")
    expect(operation.reload.state).to eq("succeeded")
    expect(operation.refund.status).to eq("succeeded")
    expect(operation.refund_observations.count).to eq(3)
    expect(operation.refund_effects.count).to eq(1)
    expect(fixture.first.total_refunded_cents).to eq(500)
  end

  it "does not reopen a failed reservation on stale pending, but records later confirmed success" do
    observe("failed")
    observe("pending")
    expect(operation.reload.state).to eq("failed")
    observe("succeeded")
    expect(operation.reload.state).to eq("succeeded")
  end

  it "rejects a reused event key with altered facts" do
    observe("pending", key: "same")
    expect { observe("failed", key: "same") }.to raise_error(Payments::Conflict)
    expect(operation.reload.state).to eq("pending")
  end

  it "rejects wrong identity, original reference, amount, and provider refund ID changes" do
    [ { identity_id: SecureRandom.uuid }, { original_reference: "pi_other" }, { amount_cents: 501 } ].each do |change|
      expect { observe("succeeded", **change) }.to raise_error(Payments::BindingError)
    end
    observe("pending")
    expect { observe("succeeded", raw_id: "re_different") }.to raise_error(Payments::BindingError)
    expect(operation.reload.state).to eq("pending")
  end

  it "prevents one provider refund ID from being credited twice within the same identity" do
    observe("succeeded")
    other = Payments::ReserveRefund.call(order: fixture.first, amount_cents: 500, request_key: "other")
    expect do
      described_class.call(operation: other, event_key: "duplicate-id", status: "succeeded", raw_id: "re_event",
        amount_cents: 500, identity_id: fixture[1].id, original_reference: fixture[3].raw_provider_id)
    end.to raise_error(Payments::BindingError)
    expect(other.reload.state).to eq("reserved")
  end

  it "only correlates Stripe events with a known refund operation and the original signed charge facts" do
    refund = { id: "re_webhook", status: "succeeded", amount: 500, currency: "usd",
      payment_intent: fixture[3].raw_provider_id, charge: "ch_event", metadata: { refund_operation_id: operation.id } }
    args = { identity: fixture[1], event_id: "evt_fixture", refund: refund, original_references: [ fixture[3].raw_provider_id, "ch_event" ] }
    expect(Payments::StripeRefundEvent.call(**args).state).to eq("succeeded")
    expect(Payments::StripeRefundEvent.call(**args).refund_observations.count).to eq(1)
    expect { Payments::StripeRefundEvent.call(**args.merge(event_id: "evt_wrong", original_references: [ "pi_other" ])) }.to raise_error(Payments::BindingError)
    expect { Payments::StripeRefundEvent.call(**args.merge(event_id: "evt_currency", refund: refund.merge(currency: "eur"))) }.to raise_error(Payments::BindingError)
    expect(operation.reload.state).to eq("succeeded")
  end
end
