require 'rails_helper'

RSpec.describe Payments::Worldpay::TriPosProvider do
  let(:user) { create(:user, :admin) }
  let(:location) { create(:location, hours_json: {'Daily' => '00:00-23:59'}) }
  let(:product) { create(:product, product_type: 'local', allow_pickup: true, allow_shipping: false, inventory_level: 'product', product_stock_quantity: 10) }
  let(:variant) { create(:product_variant, product: product, price_cents: 1250) }
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'sandbox', external_account_id: 'fixture-account', external_acceptor_id: 'fixture-acceptor', profile_key: SecureRandom.uuid, credential_reference: 'worldpay_default') }
  let(:caps) { {'usd_query_contract' => true, 'query_completeness_approved' => true, 'reporting_time_zone' => 'America/Chicago', 'captured_statuses' => %w[1 15], 'declined_statuses' => ['2'], 'cancelled_statuses' => [], 'sale_types' => ['CreditCardSale'], 'allowed_payment_types' => ['Credit'], 'user_input_timeout' => '60000'} }
  let!(:profile) { PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'pos', presentation: 'worldpay_terminal', capabilities: caps, enabled: true) }
  let(:terminal) { PaymentTerminal.create!(payment_identity: identity, payment_profile: profile, location: location, label: 'Bound reader', lane_id: '101', terminal_id: 'fixture-terminal') }
  let(:attempt) do
    ProductLocation.create!(product: product, location: location)
    order = create(:order, source: 'pos', user: nil, staff_created: true, created_by_user_id: user.id, location: location,
      fulfillment_type: 'pickup', payment_method: 'card_present', subtotal_cents: 1250, total_cents: 1250, shipping_cost_cents: 0, tax_cents: 0, customer_phone: nil)
    order.order_items.create!(product_variant: variant, product: product, quantity: 1, unit_price_cents: 1250, total_price_cents: 1250)
    Payments::CreateCheckout.call(user: user, capability: nil, idempotency_key: SecureRandom.uuid, cart_items: order.order_items.to_a,
      attributes: {fulfillment_type: 'pickup', location_id: location.id, payment_method: 'card_present', payment_terminal_id: terminal.id}, channel: 'pos', existing_order: order)
    row = PaymentAttempt.find(order.reload.payment_attempt_id)
    terminal.update!(leased_attempt: row, leased_at: Time.current)
    row.update!(dispatched_at: Time.current)
    row
  end
  let(:client) { double('injected native client') }
  let(:runtime) { double('assigned runtime', client: client, profile: {'capabilities' => caps}) }
  let(:provider) { described_class.new(identity, runtime_factory: ->(_) {runtime}) }
  before do
    SiteSetting.instance.update!(payment_processor: 'worldpay')
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider HTTP forbidden' }
  end
  def native_sale(**overrides)
    money = Payments::Worldpay::Money::DecimalLexeme.new('12.50')
    fields = {'_hasErrors' => false, '_errors' => [], '_processor' => {'expressResponseCode' => '0', 'hostResponseCode' => '00'},
      'transactionId' => 'bound-charge', 'terminalId' => terminal.terminal_id, 'currencyCode' => 'USD',
      'approvedAmount' => money, 'totalAmount' => money, 'isApproved' => true, 'isOffline' => false, 'transactionStored' => false,
      'accountNumber' => '4111111111111111', 'cardLogo' => 'Fixture card', 'entryMode' => 'Contactless'}
    response = Payments::Worldpay::TriPosResponseParser.call(JSON.generate(fields.merge(overrides.transform_keys(&:to_s))), operation: :sale)
    response.merge(http_status: 200, request_id_echo_verified: true)
  end
  def row(**overrides)
    money = Payments::Worldpay::Money::DecimalLexeme.new('12.50')
    {'AccountId' => {'Value' => identity.external_account_id}, 'accountId' => identity.external_account_id, 'acceptorId' => identity.external_acceptor_id,
      'transactionId' => 'bound-charge', 'referenceNumber' => attempt.reference_number.to_s, 'terminalId' => terminal.terminal_id,
      'transactionAmount' => money, 'approvedAmount' => money, 'transactionStatus' => 'Approved', 'transactionStatusCode' => '1',
      'transactionType' => 'CreditCardSale', 'expressResponseCode' => '0', 'HostResponseCode' => '00'}.merge(overrides.transform_keys(&:to_s))
  end
  def native_query(rows)
    Payments::Worldpay::TriPosResponseParser.call(JSON.generate('_hasErrors' => false, '_errors' => [], 'reportingData' => rows), operation: :query).merge(http_status: 200, request_id_echo_verified: true)
  end
  it 'normalizes one context-bound sale and projects only safe receipt facts through common finalization' do
    allow(client).to receive(:sale).and_return(native_sale)
    result = provider.sale(attempt: attempt)
    expect(result).to have_attributes(status: 'captured', requested_cents: 1250, approved_cents: 1250, captured_cents: 1250)
    expect(result.metadata[:receipt]).to include(last4: '1111')
    expect(result.metadata.to_json).not_to include('4111111111111111')
    order = Payments::FinalizeOrder.call(attempt: attempt, result: result)
    expect(order.payment_status).to eq('paid')
    expect(Payments::ReceiptFacts.for_order(order)).to include('last4' => '1111', 'environment' => 'sandbox', 'transaction_id' => 'bound-charge')
    expect(product.reload.product_stock_quantity).to eq(9)
  end
  it 'retains the actual partial approval and claims compensation without committing inventory' do
    allow(client).to receive(:sale).and_return(native_sale(approvedAmount: Payments::Worldpay::Money::DecimalLexeme.new('6.25')))
    result = provider.sale(attempt: attempt)
    expect(result).to have_attributes(status: 'partial', approved_cents: 625, captured_cents: 0)
    Payments::FinalizeOrder.call(attempt: attempt, result: result)
    expect(attempt.reload.compensation_claimed_at).to be_present
    expect(InventoryCommitment.where(order_id: attempt.order_id)).to be_empty
    expect(attempt.order.reload.payment_status).to eq('pending')
  end
  it 'keeps a terminal/amount mismatch quarantined through a later valid capture query' do
    allow(client).to receive(:sale).and_return(native_sale(terminalId: 'other-terminal'))
    expect(provider.sale(attempt: attempt).status).to eq('unknown')
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to be_present
    allow(client).to receive(:query).and_return(native_query([row]))
    result = provider.query(attempt: attempt)
    expect(result.status).to eq('unknown')
    Payments::FinalizeOrder.call(attempt: attempt, result: result)
    expect(attempt.order.reload.payment_status).to eq('pending')
  end
  it 'allows query recovery after a communication error with no approval evidence' do
    allow(client).to receive(:sale).and_return(native_sale(_hasErrors: true, _errors: [{}], isApproved: false, approvedAmount: 0,
      _processor: {'expressResponseCode' => '1001', 'hostResponseCode' => 'XX'}))
    expect(provider.sale(attempt: attempt).status).to eq('unknown')
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to be_nil
    allow(client).to receive(:query).and_return(native_query([row]))
    result = provider.query(attempt: attempt)
    expect(result.status).to eq('captured')
    Payments::FinalizeOrder.call(attempt: attempt, result: result)
    expect(attempt.order.reload.payment_status).to eq('paid')
  end
  it 'retains malformed or multiple transaction evidence and never relaxes quarantine' do
    allow(client).to receive(:query).and_return(native_query([row, {'transactionId' => 'uninspectable-charge'}]))
    expect(provider.query(attempt: attempt).status).to eq('unknown')
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to be_present
    allow(client).to receive(:query).and_return(native_query([row]))
    expect(provider.query(attempt: attempt).status).to eq('unknown')
    expect(attempt.order.reload.payment_status).to eq('pending')
  end
  it 'does not authorize empty, saturated, uncorrelated or offline observations' do
    allow(client).to receive(:query).and_return(native_query([]))
    expect(provider.query(attempt: attempt).status).to eq('unknown')
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to be_nil
    allow(client).to receive(:sale).and_return(native_sale(isOffline: true))
    expect(provider.sale(attempt: attempt).status).to eq('unknown')
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to be_present
  end
  it 'refuses to send a sale without its durable dispatch and original lease' do
    attempt.update!(dispatched_at: nil)
    expect(client).not_to receive(:sale)
    expect { provider.sale(attempt: attempt) }.to raise_error(Payments::BindingError)
  end
end
