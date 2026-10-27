require 'rails_helper'

RSpec.describe 'Worldpay hosted checkout contracts', type: :request do
  include ActiveSupport::Testing::TimeHelpers
  let(:capability) { SecureRandom.hex(32) }
  let(:key) { SecureRandom.uuid }
  let(:cart_id) { SecureRandom.uuid }
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'sandbox', external_account_id: 'fixture-account', external_acceptor_id: 'fixture-acceptor', profile_key: SecureRandom.uuid, credential_reference: 'worldpay_default') }
  let(:location) { create(:location, active: true, hours_json: { 'Daily' => '00:00-23:59' }) }
  let(:product) { create(:product, published: true, inventory_level: 'variant', allow_pickup: true) }
  let(:variant) { create(:product_variant, product: product, stock_quantity: 10, price_cents: 1250, available: true) }
  let(:setup_id) { '12345678-1234-1234-1234-123456789abc' }
  let(:terminal) { { 'approved' => true, 'key' => 'fixture-profile', 'fields' => {
    'Terminal' => Payments::Worldpay::ProfileSnapshot::TERMINAL_FIELDS.to_h { |name| [ name, "fixture-#{name}" ] },
    'Transaction' => { 'MarketCode' => 'fixture-market', 'PartialApprovedFlag' => 'fixture-policy' }
  } } }
  let(:caps) { { 'terminal_profile' => terminal, 'hosted_page_variant' => 'legacy', 'return_origins' => [ 'https://api.example.test' ],
    'setup_fields' => Payments::Worldpay::ProfileSnapshot::SETUP_FIELDS.to_h { |name| [ name, "fixture-#{name}" ] },
    'reporting_time_zone' => 'UTC', 'application_version' => 'fixture-release', 'usd_query_contract' => true, 'fraud_policy' => 'processor_enforced' } }
  let!(:profile) { PaymentProfile.create!(provider: 'worldpay', payment_identity: identity, channel: 'online', presentation: 'worldpay_hosted_page', capabilities: caps, enabled: true) }
  let(:env) { { 'APP_DEPLOYMENT_ENV' => 'test', 'WORLDPAY_MODE' => 'sandbox',
    'WORLDPAY_EXPRESS_ACCOUNT_ID' => 'fixture-account', 'WORLDPAY_EXPRESS_ACCOUNT_TOKEN' => 'fixture-secret', 'WORLDPAY_EXPRESS_ACCEPTOR_ID' => 'fixture-acceptor',
    'WORLDPAY_EXPRESS_APPLICATION_ID' => 'fixture-app', 'WORLDPAY_EXPRESS_APPLICATION_NAME' => 'Fixture', 'WORLDPAY_EXPRESS_APPLICATION_VERSION' => 'fixture-release',
    'WORLDPAY_EXPRESS_TRANSACTION_URL' => 'https://certtransaction.elementexpress.com/', 'WORLDPAY_EXPRESS_REPORTING_URL' => 'https://certreporting.elementexpress.com/',
    'WORLDPAY_EXPRESS_SERVICES_URL' => 'https://certservices.elementexpress.com/', 'WORLDPAY_EXPRESS_HOSTED_BASE_URL' => 'https://certtransaction.hostedpayments.com/',
    'WORLDPAY_TERMINAL_PROFILE_KEY' => 'fixture-profile', 'WORLDPAY_RETURN_URL' => 'https://api.example.test/api/v1/payments/worldpay/return' } }
  let(:headers) { { 'X-Checkout-Capability' => capability, 'X-Session-ID' => cart_id, 'Idempotency-Key' => key } }
  let(:calls) { [] }
  let(:transport) { ->(interface:, body:) {
    calls << { interface: interface, body: body }
    if interface == :transaction
      "<TransactionSetupResponse xmlns=\"https://transaction.elementexpress.com\"><Response><ExpressResponseCode>0</ExpressResponseCode><TransactionSetup><TransactionSetupID>#{setup_id}</TransactionSetupID><ValidationCode>fixture-return-code</ValidationCode></TransactionSetup></Response></TransactionSetupResponse>"
    else
      query_response
    end
  } }
  let(:query_changes) { {} }
  let(:extra_rows) { [] }
  let(:query_empty) { false }

  def query_response
    attempt = PaymentAttempt.last
    values = { 'TransactionID' => '000123', 'ReferenceNumber' => attempt.reference_number.to_s, 'AccountID' => 'fixture-account', 'AcceptorID' => 'fixture-acceptor',
      'TerminalID' => 'fixture-TerminalID', 'ApprovalNumber' => 'fixture-approval', 'ExpressResponseCode' => '0', 'TransactionType' => 'CreditCardSale',
      'TransactionStatusCode' => '1', 'TransactionAmount' => '25.00' }.merge(query_changes)
    rows = query_empty ? [] : [ values ] + extra_rows.map { |changes| values.merge(changes) }
    items = rows.map { |row| '<Item>' + row.map { |name, value| "<#{name}>#{ERB::Util.html_escape(value)}</#{name}>" }.join + '</Item>' }.join
    "<TransactionQueryResponse xmlns=\"https://reporting.elementexpress.com\"><Response><ExpressResponseCode>0</ExpressResponseCode><ReportingData><Items>#{items}</Items></ReportingData></Response></TransactionQueryResponse>"
  end

  def start_checkout
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers
    expect(response).to have_http_status(:created), response.body
    response.parsed_body
  end

  before do
    SiteSetting.instance.update!(payment_processor: 'worldpay')
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 2)
    allow(Net::HTTP).to receive(:new).and_raise('Real payment network forbidden')
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('FRONTEND_URL').and_return('https://shop.example.test')
    allow(Payments::Worldpay::Runtime).to receive(:new).and_wrap_original { |original, **args| original.call(**args, env: env, transport: transport) }
  end

  it 'does not publish Worldpay credentials in the public Stripe configuration' do
    get '/api/v1/config'
    expect(response.parsed_body).to include('stripe_account_id' => nil, 'stripe_publishable_key' => nil, 'payment_presentation' => 'worldpay_hosted_page')
    expect(response.body).not_to include('fixture-account', 'fixture-secret', 'fixture-acceptor')
  end

  it 'keeps setup and charge IDs separate, then consumes one authenticated query once' do
    state = start_checkout
    attempt = PaymentAttempt.last
    expect(attempt.raw_provider_id).to be_nil
    expect(attempt.setup_id).to eq(setup_id)
    expect(attempt.order.payment_reference).to be_blank
    expect(state['flow']).to eq('worldpay_hosted_page')
    expect(state.to_json).not_to include('fixture-return-code', 'fixture-secret', 'fixture-account')
    expect(attempt.provider_metadata['worldpay_validation_digest']).to eq(Digest::SHA256.hexdigest('fixture-return-code'))
    2.times { Payments::SetupAttempt.call(attempt: attempt.reload) }
    expect(calls.count { |call| call[:interface] == :transaction }).to eq(1)
    # Settings/profile edits cannot reroute the existing intent.
    profile.update!(capabilities: caps.merge('terminal_profile' => {}), enabled: false)
    SiteSetting.instance.update!(payment_processor: 'stripe')
    2.times { Payments::ReconcileAttempt.call(attempt: attempt, force: true) }
    expect(attempt.order.reload.payment_status).to eq('paid')
    expect(attempt.reload.raw_provider_id).to eq('000123')
    expect(variant.reload.stock_quantity).to eq(8)
    expect(PaymentTransaction.where(payment_attempt: attempt).count).to eq(1)
    expect(InventoryCommitment.where(order: attempt.order).count).to eq(1)
    expect(calls.last[:body]).to include("<TransactionSetupID>#{setup_id}</TransactionSetupID>")
    expect(calls.none? { |call| call[:body].include?('<CreditCardSale') }).to be(true)
  end

  it 'queries only a valid signed return and ignores forged financial hints' do
    start_checkout
    attempt = PaymentAttempt.last
    state = Nokogiri::XML(calls.first[:body]).at_xpath('//*[local-name()="ReturnURL"]').text
    params = URI.decode_www_form(URI(state).query).to_h.merge('ValidationCode' => 'wrong', 'TransactionSetupID' => setup_id, 'ApprovedAmount' => '999.99')
    get '/api/v1/payments/worldpay/return', params: params
    expect(response).to have_http_status(:not_found)
    expect(calls.size).to eq(1)
    get '/api/v1/payments/worldpay/return', params: params.merge('ValidationCode' => 'fixture-return-code')
    expect(response).to have_http_status(:see_other)
    expect(attempt.order.reload.payment_status).to eq('paid')
  end

  it 'does not claim payment or compensation from a partial/duplicate/foreign amount observation' do
    start_checkout
    %w[12.50 0.01].each do |amount|
      query_changes['TransactionAmount'] = amount
      Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
      expect(Order.last.payment_status).to eq('pending')
      expect(PaymentTransaction.count).to eq(0)
    end
    expect(PaymentOutbox.where(kind: 'compensate')).to be_empty
  end

  it 'rejects a foreign account and does not consume or reverse it' do
    start_checkout
    query_changes['AccountID'] = 'foreign-account'
    expect { Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true) }.to raise_error(Payments::BindingError)
    expect(PaymentTransaction.count).to eq(0)
    expect(PaymentOutbox.where(kind: 'compensate')).to be_empty
  end

  it 'keeps the original hosted page resumable after an empty waiting-card query until expiry' do
    allow(self).to receive(:query_empty).and_return(true)
    state = start_checkout
    attempt = PaymentAttempt.last
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    get "/api/v1/checkout_sessions/#{state['id']}", headers: headers
    expect(response.parsed_body['payment_state']).to eq('unknown')
    expect(response.parsed_body.dig('collection_config', 'hosted_url')).to include(setup_id)
    expect(calls.count { |call| call[:interface] == :transaction }).to eq(1)
    travel 11.minutes do
      get "/api/v1/checkout_sessions/#{state['id']}", headers: headers
      expect(response.parsed_body['collection_config']).to eq({})
    end
  end

  it 'fulfills one approved sale after a definitively declined card under the same setup' do
    start_checkout
    extra_rows << { 'TransactionID' => '000122', 'ExpressResponseCode' => '20', 'TransactionStatusCode' => '2', 'ApprovalNumber' => '' }
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
    expect(Order.last.payment_status).to eq('paid')
    expect(PaymentTransaction.pluck(:raw_provider_id)).to eq([ '000123' ])
    expect(variant.reload.stock_quantity).to eq(8)
  end

  it 'quarantines multiple approvals and validates the binding of declined rows too' do
    start_checkout
    extra_rows << { 'TransactionID' => '000124' }
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
    expect(Order.last.payment_status).to eq('pending')
    expect(PaymentAttempt.last.provider_metadata['worldpay_collection_blocked']).to be(true)
    extra_rows.replace([ { 'TransactionID' => '000122', 'AccountID' => 'foreign', 'ExpressResponseCode' => '20', 'TransactionStatusCode' => '2', 'ApprovalNumber' => '' } ])
    expect { Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true) }.to raise_error(Payments::BindingError)
    expect(PaymentTransaction.count).to eq(0)
  end

  it 'rejects supplied failed authentication before it can create a guest setup' do
    allow_any_instance_of(Api::V1::CheckoutSessionsController).to receive(:verify_token_with_clerk).and_raise(StandardError, 'fixture unavailable auth')
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers.merge('Authorization' => 'Bearer invalid-fixture')
    expect(response).to have_http_status(:unauthorized)
    expect(Order.count).to eq(0)
    expect(CheckoutSession.count).to eq(0)
    expect(calls).to be_empty
  end

  it 'keeps financial ambiguity quarantined across empty, declined and single-approval queries' do
    state = start_checkout
    attempt = PaymentAttempt.last
    extra_rows << { 'TransactionID' => '000124' }
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    original = attempt.reload.provider_metadata.fetch('worldpay_financial_quarantine')
    extra_rows.clear
    allow(self).to receive(:query_empty).and_return(true)
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    allow(self).to receive(:query_empty).and_return(false)
    query_changes.merge!('ExpressResponseCode' => '20', 'TransactionStatusCode' => '2', 'ApprovalNumber' => '')
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    query_changes.clear
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    expect(attempt.reload.provider_metadata['worldpay_financial_quarantine']).to eq(original)
    expect(attempt.state).to eq('reconciliation_required')
    get "/api/v1/checkout_sessions/#{state['id']}", headers: headers
    expect(response.parsed_body['collection_config']).to eq({})
    expect(Order.last.payment_status).to eq('pending')
    expect(variant.reload.stock_quantity).to eq(10)
    expect(PaymentTransaction.count).to eq(0)
  end

  it 'does not let an overlapping earlier empty query relax a later partial quarantine' do
    start_checkout
    allow(self).to receive(:query_empty).and_return(true)
    first = true
    allow(transport).to receive(:call).and_wrap_original do |original, **request|
      if request[:interface] == :reporting && first
        first = false
        earlier_empty = query_response
        allow(self).to receive(:query_empty).and_return(false)
        query_changes['ExpressResponseCode'] = '5'
        Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
        earlier_empty
      else
        original.call(**request)
      end
    end
    Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
    expect(PaymentAttempt.last.provider_metadata['worldpay_collection_blocked']).to be(true)
    expect(PaymentAttempt.last.provider_metadata['worldpay_financial_quarantine']).to be_present
    expect(Order.last.payment_status).to eq('pending')
    expect(variant.reload.stock_quantity).to eq(10)
  end

  it 'rechecks durable quarantine at finalization after an earlier capture query already returned' do
    start_checkout
    attempt = PaymentAttempt.last
    earlier_capture = Payments::ProviderResolver.for_identity(identity).query(attempt: attempt)
    expect(earlier_capture.status).to eq('captured')
    query_changes['ExpressResponseCode'] = '5'
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    Payments::FinalizeOrder.call(attempt: attempt, result: earlier_capture)
    expect(Order.last.payment_status).to eq('pending')
    expect(PaymentTransaction.count).to eq(0)
    expect(variant.reload.stock_quantity).to eq(10)
  end

  it 'preserves an already consumed paid order when ambiguity arrives later' do
    start_checkout
    attempt = PaymentAttempt.last
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    query_changes['ExpressResponseCode'] = '5'
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    expect(Order.last.payment_status).to eq('paid')
    expect(variant.reload.stock_quantity).to eq(8)
    expect(PaymentOutbox.where(kind: 'compensate')).to be_empty
  end

  it 'binds setup and query credentials to the original immutable acceptor' do
    start_checkout
    expect { identity.update!(external_acceptor_id: 'replacement') }.to raise_error(ActiveRecord::ReadonlyAttributeError)
    env['WORLDPAY_EXPRESS_ACCEPTOR_ID'] = 'replacement'
    expect { Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect(calls.size).to eq(1)
    expect(Order.last.payment_status).to eq('pending')
  end

  it 'marks only an authoritative pre-intent validation failure as safe to edit' do
    variant.update!(stock_quantity: 0)
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body['checkout_rejected_before_intent']).to be(true)
    expect(Order.count).to eq(0)
    expect(CheckoutSession.count).to eq(0)
  end

  it 'requires the assigned USD/fraud contract before dispatch and captures only allowed profile fields' do
    profile.update!(capabilities: caps.merge('usd_query_contract' => false, 'account_token' => 'not-for-snapshots',
      'terminal_profile' => terminal.merge('account_token' => 'not-for-snapshots')))
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers
    expect(response).to have_http_status(:accepted)
    expect(PaymentAttempt.last.dispatched_at).to be_nil
    expect(PaymentAttempt.last.snapshot.to_json).not_to include('not-for-snapshots', 'account_token')
    expect(calls).to be_empty
  end

  it 'retains unknown for partial, duplicate, malformed and absent financial proof' do
    start_checkout
    %w[5 22 1001 1002].each do |code|
      query_changes['ExpressResponseCode'] = code
      Payments::ReconcileAttempt.call(attempt: PaymentAttempt.last, force: true)
      expect(Order.last.payment_status).to eq('pending')
    end
    expect(variant.reload.stock_quantity).to eq(10)
    expect(PaymentTransaction.count).to eq(0)
  end

  it 'does not mark a pre-dispatch configuration failure as financial dispatch' do
    env.delete('WORLDPAY_EXPRESS_ACCOUNT_TOKEN')
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers
    expect(response).to have_http_status(:accepted)
    expect(PaymentAttempt.last.dispatched_at).to be_nil
    expect(calls).to be_empty
  end

  it 'preserves a lost setup response and never blindly redispatches' do
    allow(transport).to receive(:call).and_raise(Timeout::Error)
    post '/api/v1/checkout_sessions', params: { order: { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }, headers: headers
    attempt = PaymentAttempt.last
    expect(attempt.dispatched_at).to be_present
    expect(attempt.provider_metadata.dig('worldpay_setup', 'operation_key')).to eq(attempt.operation_key)
    expect(transport).not_to receive(:call)
    Payments::ReconcileAttempt.call(attempt: attempt, force: true)
    expect(attempt.reload.state).to eq('unknown')
    expect(attempt.order.reload.payment_status).to eq('pending')
  end
end
