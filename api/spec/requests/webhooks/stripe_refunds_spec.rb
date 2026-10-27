require 'rails_helper'
require_relative '../../support/refund_fixtures'

RSpec.describe 'Signed Stripe refund convergence', type: :request do
  include RefundFixtures
  let(:fixture) { captured_order }
  let(:order) { fixture.first }
  let(:secret) { 'fixture_signing_secret' }

  before do
    # Another profile for this same account must not choose the wrong identity.
    PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_refund_fixture',
      profile_key: SecureRandom.uuid, credential_reference: 'stripe_default')
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('STRIPE_WEBHOOK_SECRET').and_return(secret)
  end

  def refund_object(operation, id: 're_signed', state: 'succeeded')
    { id: id, object: 'refund', status: state, amount: operation.amount_cents, currency: 'usd',
      payment_intent: operation.original_reference, charge: 'ch_signed',
      metadata: { refund_operation_id: operation.id, operation_key: operation.operation_key } }
  end

  def deliver(type, object, id: 'evt_signed', account: fixture[1].external_account_id, livemode: false)
    event = { id: id, object: 'event', type: type, account: account, livemode: livemode, data: { object: object } }.to_json
    timestamp = Time.now.to_i
    signature = OpenSSL::HMAC.hexdigest('SHA256', secret, "#{timestamp}.#{event}")
    post '/webhooks/stripe', params: event, headers: { 'CONTENT_TYPE' => 'application/json', 'Stripe-Signature' => "t=#{timestamp},v1=#{signature}" }
  end

  it 'binds first-webhook-before-response to the original profile and never regresses on late failure' do
    op = Payments::ReserveRefund.call(order: order, amount_cents: 500, request_key: 'first-webhook')
    2.times do
      deliver('refund.created', refund_object(op))
      expect(response).to have_http_status(:ok), response.body
    end
    expect(op.reload.state).to eq('succeeded')
    expect(PaymentEvent.count).to eq(1)
    expect(PaymentEvent.first.payment_identity_id).to eq(op.payment_identity_id)
    expect(RefundObservation.count).to eq(1)
    expect(PaymentOutbox.where(kind: 'refund_notification').count).to eq(1)
    expect(op.refund.reload.email_sent).to be false
    deliver('refund.failed', refund_object(op, state: 'failed'), id: 'evt_late_failure')
    expect(response).to have_http_status(:ok)
    expect(op.reload.state).to eq('succeeded')
    expect(op.refund.reload.status).to eq('succeeded')
  end

  it 'processes all charge refund pages under the original identity without SDK calls inside locks' do
    ops = 2.times.map { |i| Payments::ReserveRefund.call(order: order, amount_cents: 500, request_key: "page-#{i}") }
    refunds_api = double('refund list')
    provider = double(client: double(v1: double(refunds: refunds_api)))
    expect(Payments::ProviderResolver).to receive(:for_identity).with(have_attributes(id: ops.first.payment_identity_id)).and_return(provider)
    expect(refunds_api).to receive(:list).with({ charge: 'ch_signed', limit: 100, starting_after: 're_page1' }) do
      expect(ActiveRecord::Base.connection.open_transactions).to eq(1) # RSpec fixture only; webhook holds no operation locks.
      Stripe::StripeObject.construct_from(data: [refund_object(ops.last, id: 're_page2')], has_more: false)
    end
    charge = { id: 'ch_signed', object: 'charge', payment_intent: fixture[3].raw_provider_id,
      refunds: { object: 'list', data: [refund_object(ops.first, id: 're_page1')], has_more: true } }
    deliver('charge.refunded', charge, id: 'evt_pages')
    expect(response).to have_http_status(:ok), response.body
    expect(ops.map { |op| op.reload.state }).to eq(%w[succeeded succeeded])
    expect(RefundObservation.count).to eq(2)
    expect(RefundEffect.count).to eq(2)
  end

  it 'rejects a signed foreign account, wrong environment and altered original reference' do
    op = Payments::ReserveRefund.call(order: order, amount_cents: 500, request_key: 'bound')
    deliver('refund.updated', refund_object(op), account: 'acct_other')
    expect(response).to have_http_status(:unprocessable_entity)
    deliver('refund.updated', refund_object(op), id: 'evt_live', livemode: true)
    expect(response).to have_http_status(:unprocessable_entity)
    deliver('refund.updated', refund_object(op).merge(payment_intent: 'pi_foreign'), id: 'evt_wrong_reference')
    expect(response).to have_http_status(:unprocessable_entity)
    expect(op.reload.state).to eq('reserved')
    expect(RefundEffect.count).to eq(0)
  end
end
