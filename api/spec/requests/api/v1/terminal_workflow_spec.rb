require 'rails_helper'

RSpec.describe 'Bound terminal collection and administration', type: :request do
  let(:location) { create(:location, hours_json: {'Daily' => '00:00-23:59'}) }
  let(:other_location) { create(:location, hours_json: {'Daily' => '00:00-23:59'}) }
  let(:owner) { create(:user, :admin) }
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'simulated', external_account_id: 'terminal-fixture', profile_key: SecureRandom.uuid, credential_reference: 'simulation') }
  let!(:profile) { PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'pos', presentation: 'worldpay_terminal', enabled: true) }
  let(:terminal) { PaymentTerminal.create!(payment_identity: identity, payment_profile: profile, location: location, label: 'Local reader', lane_id: '101', terminal_id: 'fixture-terminal') }
  let(:product) { create(:product, product_type: 'local', allow_pickup: true, allow_shipping: false, inventory_level: 'product', product_stock_quantity: 20) }
  let(:variant) { create(:product_variant, product: product, price_cents: 1250) }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    SiteSetting.instance.update!(payment_processor: 'worldpay', enable_storefront_three_squares: true)
    ProductLocation.create!(product: product, location: location)
    acting(owner)
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'Provider HTTP forbidden in terminal workflow specs' }
  end
  def acting(user)
    [Api::V1::Admin::PosOrdersController, Api::V1::Admin::PaymentTerminalsController, Api::V1::CheckoutSessionsController].each do |controller|
      allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
      allow_any_instance_of(controller).to receive(:current_user).and_return(user)
    end
  end
  def saved_order
    @key = SecureRandom.uuid
    post '/api/v1/admin/pos/orders', params: {order: {payment_method: 'card_present', location_id: location.id,
      payment_terminal_id: terminal.id, items: [{product_variant_id: variant.id, quantity: 1}]}}, headers: {'Idempotency-Key' => @key}, as: :json
    expect(response).to have_http_status(:created), response.body
    PaymentAttempt.find(response.parsed_body.fetch('payment_attempt_id'))
  end
  def start(attempt)
    post "/api/v1/admin/pos/orders/#{attempt.order_id}/payments", params: {payment_terminal_id: terminal.id}, headers: {'Idempotency-Key' => @key}, as: :json
    expect(response).to have_http_status(:accepted), response.body
  end
  it 'freezes the selected reader and records one financial outbox effect across duplicate requests/jobs' do
    attempt = saved_order
    expect(attempt.dispatched_at).to be_nil
    expect(attempt.snapshot.dig('collection', 'terminal', 'id')).to eq(terminal.id)
    2.times { start(attempt) }
    expect(PaymentOutbox.where(kind: 'terminal_sale').count).to eq(1)
    expect(terminal.reload.leased_attempt_id).to eq(attempt.id)
    sales = 0
    allow_any_instance_of(Payments::TerminalProvider).to receive(:sale).and_wrap_original { |method, **args| sales += 1; method.call(**args) }
    2.times { ProcessTerminalSaleJob.perform_now(attempt.id) }
    expect(sales).to eq(1)
    expect(attempt.reload.dispatched_at).to be_present
    expect(attempt.state).to eq('unknown') # Empty query is not proof that no charge can arrive.
    expect(attempt.order.reload.payment_status).to eq('pending')
  end
  it 'does not expose simulator card readiness before the worker commits dispatch' do
    attempt = saved_order
    start(attempt)
    get "/api/v1/admin/payment_terminals/#{terminal.id}/status"
    expect(response.parsed_body.fetch('collection_ready')).to be(false)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate", params: {attempt_id: attempt.id, command: 'approve'}, as: :json
    expect(response).to have_http_status(:conflict)
    expect(SimulatedPaymentRecord.find_by!(payment_attempt: attempt, kind: 'collection').state).to eq('collecting')
    ProcessTerminalSaleJob.perform_now(attempt.id)
    get "/api/v1/admin/payment_terminals/#{terminal.id}/status"
    expect(response.parsed_body.fetch('collection_ready')).to be(true)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate", params: {attempt_id: attempt.id, command: 'approve'}, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(attempt.order.reload.payment_status).to eq('paid')
    expect(Payments::ReceiptFacts.for_order(attempt.order)).to include('last4' => '4242')
  end

  it 'queries after a crash at the dispatch boundary instead of sending another sale' do
    attempt = saved_order
    start(attempt)
    sales = 0
    allow_any_instance_of(Payments::TerminalProvider).to receive(:sale) { sales += 1; raise Payments::Error, 'lost before transmission' }
    expect { ProcessTerminalSaleJob.perform_now(attempt.id) }.to raise_error(Payments::Error)
    ProcessTerminalSaleJob.perform_now(attempt.id)
    expect(sales).to eq(1)
    expect(attempt.reload.dispatched_at).to be_present
    expect(terminal.reload.leased_attempt_id).to eq(attempt.id)
    expect(InventoryCommitment.where(order_id: attempt.order_id)).to be_empty
  end
  it 'restores simulator reader readiness from its bound ledger after a worker dies during dispatch' do
    attempt = saved_order
    start(attempt)
    allow_any_instance_of(Payments::TerminalProvider).to receive(:sale).and_raise(Payments::Error, 'worker died after claim')
    expect { ProcessTerminalSaleJob.perform_now(attempt.id) }.to raise_error(Payments::Error)
    expect(terminal.reload.status).to eq('processing')
    Payments::ReconcileAttempt.call(attempt: attempt.reload, force: true)
    expect(terminal.reload.status).to eq('waiting_for_card')
    expect(attempt.reload.dispatched_at).to be_present
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate", params: {attempt_id: attempt.id, command: 'approve'}, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(attempt.order.reload.payment_status).to eq('paid')
    expect(SimulatedPaymentRecord.where(payment_attempt: attempt, kind: 'collection').count).to eq(1)
  end

  it 'cancels locally before dispatch and never sends a queued sale afterward' do
    attempt = saved_order
    start(attempt)
    Payments::CancelCheckout.call(attempt: attempt)
    expect_any_instance_of(Payments::TerminalProvider).not_to receive(:sale)
    ProcessTerminalSaleJob.perform_now(attempt.id)
    expect(attempt.reload.state).to eq('cancelled')
    expect(attempt.dispatched_at).to be_nil
    expect(terminal.reload.leased_attempt_id).to be_nil
    expect(InventoryReservation.where(order_id: attempt.order_id, state: 'held')).to be_empty
  end
  it 'compensates a late capture after cancellation intent without fulfilling or committing stock' do
    attempt = saved_order
    start(attempt)
    ProcessTerminalSaleJob.perform_now(attempt.id)
    provider = Payments::ProviderResolver.for_attempt(attempt.reload)
    expect { provider.collect(attempt: attempt, handle: attempt.collection_config.fetch('client_secret'), scenario: 'timeout_after_approval') }.to raise_error(Payments::Error)
    Payments::CancelCheckout.call(attempt: attempt)
    expect(attempt.reload.compensation_claimed_at).to be_present
    expect(attempt.order.reload.payment_status).to eq('pending')
    expect(InventoryCommitment.where(order_id: attempt.order_id)).to be_empty
    Payments::CompensateAttempt.call(attempt: attempt)
    Payments::TerminalLease.release_resolved(attempt)
    expect(attempt.reload.state).to eq('compensated')
    expect(product.reload.product_stock_quantity).to eq(20)
    expect(terminal.reload.leased_attempt_id).to be_nil
  end
  it 'lets staff collect their own scoped payment but denies pairing and cross-location collection' do
    acting(create(:user, role: 'staff', assigned_location: location))
    attempt = saved_order
    start(attempt)
    post '/api/v1/admin/payment_terminals', params: {payment_profile_id: profile.id, location_id: location.id,
      lane_id: '102', terminal_id: 'pair-fixture', label: 'New reader', activation_code: 'SIM-APPROVE'}, headers: {'Idempotency-Key' => SecureRandom.uuid}, as: :json
    expect(response).to have_http_status(:forbidden)
    acting(create(:user, role: 'staff', assigned_location: other_location))
    post "/api/v1/admin/payment_terminals/#{terminal.id}/collect", params: {attempt_id: attempt.id}, as: :json
    expect(response).to have_http_status(:not_found)
  end
  it 'lets an all-locations manager recover one lost pairing, but denies a scoped manager' do
    acting(create(:user, role: 'manager', assigned_location: nil))
    key = SecureRandom.uuid
    payload = {payment_profile_id: profile.id, location_id: location.id, lane_id: '102', terminal_id: 'pair-fixture', label: 'New reader', activation_code: 'SIM-TIMEOUT'}
    post '/api/v1/admin/payment_terminals', params: payload, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:accepted), response.body
    expect(PaymentTerminal.where(lane_id: '102')).to be_empty
    expect(TerminalAdministration.last.state).to eq('unknown')
    post '/api/v1/admin/payment_terminals', params: payload.except(:activation_code), headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(PaymentTerminal.where(lane_id: '102').count).to eq(1)
    expect(TerminalAdministration.count).to eq(1)
    expect(TerminalAdministration.last.facts.to_json).not_to include('SIM-TIMEOUT', 'activation_code')
    acting(create(:user, role: 'manager', assigned_location: location))
    post '/api/v1/admin/payment_terminals', params: payload.merge(lane_id: '103'), headers: {'Idempotency-Key' => SecureRandom.uuid}, as: :json
    expect(response).to have_http_status(:forbidden)
  end
  it 'collects a hosted manual card against the original POS order through the common finalizer' do
    PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'online', presentation: 'worldpay_hosted_fields', enabled: true)
    key = SecureRandom.uuid
    post '/api/v1/admin/pos/orders', params: {order: {payment_method: 'card_online', location_id: location.id,
      items: [{product_variant_id: variant.id, quantity: 1}]}}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:created), response.body
    body = response.parsed_body
    attempt = PaymentAttempt.find(body.fetch('payment_attempt_id'))
    expect(body.fetch('collection_config').fetch('checkout_session_id')).to eq(attempt.checkout_session_id)
    expect(attempt.collection_mode).to eq('hosted')
    expect(attempt.payment_terminal_id).to be_nil
    expect(attempt.checkout_session.channel).to eq('pos')
    post "/api/v1/checkout_sessions/#{attempt.checkout_session_id}/simulate", params: {
      scenario: 'approve', handle: attempt.collection_config.fetch('client_secret')}, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(attempt.order.reload).to have_attributes(source: 'pos', payment_status: 'paid', status: 'confirmed')
    expect(InventoryCommitment.where(order_id: attempt.order_id).count).to eq(1)
    expect(PaymentTerminal.where(leased_attempt_id: attempt.id)).to be_empty
    acting(create(:user, role: 'staff', assigned_location: location))
    get "/api/v1/checkout_sessions/#{attempt.checkout_session_id}"
    expect(response).to have_http_status(:not_found)
  end

  it 'does not let scoped staff use manual card simulation controls or time advances' do
    PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: 'online', presentation: 'worldpay_hosted_fields', enabled: true)
    staff = create(:user, role: 'staff', assigned_location: location)
    acting(staff)
    post '/api/v1/admin/pos/orders', params: {order: {payment_method: 'card_online', location_id: location.id,
      items: [{product_variant_id: variant.id, quantity: 1}]}}, headers: {'Idempotency-Key' => SecureRandom.uuid}, as: :json
    expect(response).to have_http_status(:created), response.body
    attempt = PaymentAttempt.find(response.parsed_body.fetch('payment_attempt_id'))
    get "/api/v1/checkout_sessions/#{attempt.checkout_session_id}"
    expect(response).to have_http_status(:ok)
    post "/api/v1/checkout_sessions/#{attempt.checkout_session_id}/simulate", params: {scenario: 'approve', handle: attempt.collection_config.fetch('client_secret')}, as: :json
    expect(response).to have_http_status(:not_found)
    post "/api/v1/checkout_sessions/#{attempt.checkout_session_id}/advance_simulation", params: {seconds: 61}, as: :json
    expect(response).to have_http_status(:not_found)
    expect(attempt.reload.simulation_offset_seconds).to eq(0)
    expect(attempt.order.reload.payment_status).to eq('pending')
  end

  it 'blocks another manager renaming an unresolved re-pair and recovers its original saved payload' do
    key = SecureRandom.uuid
    post "/api/v1/admin/payment_terminals/#{terminal.id}/pair", params: {activation_code: 'SIM-TIMEOUT'}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:accepted), response.body
    expect(TerminalAdministration.last.state).to eq('unknown')
    original_label = terminal.label
    acting(create(:user, role: 'manager', assigned_location: nil))
    patch "/api/v1/admin/payment_terminals/#{terminal.id}", params: {label: 'Changed during pairing'}, as: :json
    expect(response).to have_http_status(:conflict)
    expect(terminal.reload.label).to eq(original_label)
    acting(owner)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/pair", headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(TerminalAdministration.last.state).to eq('succeeded')
    expect(terminal.reload.label).to eq(original_label)
  end

  it 'returns only a freshly verified original Stripe intent state for SDK resume' do
    stripe_identity = PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_fixture', profile_key: SecureRandom.uuid, credential_reference: 'stripe_default')
    stripe_profile = PaymentProfile.create!(payment_identity: stripe_identity, provider: 'stripe', channel: 'pos', presentation: 'stripe_terminal', enabled: true)
    reader = PaymentTerminal.create!(payment_identity: stripe_identity, payment_profile: stripe_profile, location: location, lane_id: 'stripe-fixture', terminal_id: 'tmr_fixture', label: 'Stripe fixture')
    SiteSetting.instance.update!(payment_processor: 'stripe')
    allow(ENV).to receive(:[]).with('STRIPE_SECRET_KEY_TEST').and_return('sk_test_fictional_local')
    intents = double('offline intent API')
    client = double(v1: double(payment_intents: intents))
    allow(Stripe::StripeClient).to receive(:new).and_return(client)
    intent = nil
    expect(intents).to receive(:create).once do |payload, _|
      intent = Stripe::PaymentIntent.construct_from(payload.merge(id: 'pi_fixture', client_secret: 'pi_fixture_secret', status: 'requires_payment_method', livemode: false, amount_received: 0))
    end
    allow(intents).to receive(:retrieve) { |id| expect(id).to eq('pi_fixture'); intent }
    key = SecureRandom.uuid
    post '/api/v1/admin/pos/orders', params: {order: {payment_method: 'card_present', location_id: location.id,
      payment_terminal_id: reader.id, items: [{product_variant_id: variant.id, quantity: 1}]}}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:created), response.body
    order_id = response.parsed_body.fetch('id')
    post "/api/v1/admin/pos/orders/#{order_id}/payments", params: {payment_terminal_id: reader.id}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:accepted), response.body
    expect(response.parsed_body.fetch('terminal_resume')).to include('provider_state' => 'requires_payment_method', 'client_secret' => 'pi_fixture_secret')
    intent.status = 'processing'
    post "/api/v1/admin/pos/orders/#{order_id}/payments", params: {payment_terminal_id: reader.id}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response.parsed_body.fetch('terminal_resume').fetch('provider_state')).to eq('processing')
    intent.metadata['order_id'] = 'another-order'
    post "/api/v1/admin/pos/orders/#{order_id}/payments", params: {payment_terminal_id: reader.id}, headers: {'Idempotency-Key' => key}, as: :json
    expect(response).to have_http_status(:not_found)
    expect(response.parsed_body).not_to have_key('terminal_resume')
  end

  it 'does not re-pair or retire a lane with unresolved money' do
    attempt = saved_order
    start(attempt)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/pair", params: {activation_code: 'SIM-APPROVE'}, headers: {'Idempotency-Key' => SecureRandom.uuid}, as: :json
    expect(response).to have_http_status(:conflict), response.body
    delete "/api/v1/admin/payment_terminals/#{terminal.id}", headers: {'Idempotency-Key' => SecureRandom.uuid}
    expect(response).to have_http_status(:conflict), response.body
    expect(terminal.reload.retired_at).to be_nil
  end
end
