require 'rails_helper'

RSpec.describe Payments::Revenue do
  let(:identity) { PaymentIdentity.create!(provider: 'stripe', environment: 'production', external_account_id: 'report-fixture', credential_reference: 'fixture', profile_key: SecureRandom.uuid) }
  def verified_order(amount, refunded: 0, environment: 'production', **attributes)
    order = create(:order, total_cents: amount, payment_environment: environment, payment_identity_id: identity.id, payment_status: refunded == amount ? 'refunded' : 'paid', **attributes)
    LegacyCaptureBinding.create!(order: order, payment_identity: identity, provider: identity.provider, environment: identity.environment,
      external_account_id: identity.external_account_id, consumption_reference: "report-#{order.id}", original_reference: "report-#{order.id}", amount_cents: amount, currency: 'USD', verified_at: Time.current)
    Refund.create!(order: order, amount_cents: refunded, status: 'succeeded') if refunded.positive?
    order
  end
  it 'subtracts partial and full succeeded refunds once and excludes pending/failed/unknown reservations and other environments' do
    partial = verified_order(1000, refunded: 200)
    full = verified_order(1000, refunded: 1000)
    %w[pending unknown failed].each { |state| Refund.create!(order: partial, amount_cents: 100, status: state) }
    %w[sandbox simulated].each { |environment| verified_order(9000, environment: environment) }
    create(:order, total_cents: 9000, payment_environment: 'production', payment_status: 'paid') # Unverified display status is not capture proof.
    expect(described_class.total(Order.all)).to eq(800)
    expect(described_class.by_order(Order.all)[partial.id]).to eq(captured_cents: 1000, succeeded_refunds_cents: 200, net_revenue_cents: 800)
    expect(described_class.by_order(Order.all)[full.id][:net_revenue_cents]).to eq(0)
  end
  it 'counts separate equal-valued orders reached through duplicate item joins once each' do
    first = verified_order(1000)
    second = verified_order(1000)
    [ first, second ].each { |order| 2.times { create(:order_item, order: order) } }
    expect(described_class.total(Order.joins(:order_items).distinct)).to eq(2000)
  end
  it 'includes committed cash in ordinary revenue while keeping it outside processor settlement' do
    cash = create(:order, source: 'pos', staff_created: true, payment_method: 'cash', payment_environment: 'production', payment_status: 'paid', total_cents: 1000)
    expect(described_class.total(Order.all)).to eq(0)
    InventoryCommitment.create!(order: cash, snapshot_digest: 'fixture')
    Refund.create!(order: cash, amount_cents: 250, status: 'succeeded')
    expect(described_class.total(Order.all)).to eq(750)
    expect(PaymentTransaction.count).to eq(0)
  end
end
