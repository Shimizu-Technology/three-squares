require 'rails_helper'
require_relative '../../../support/payment_foundation_helpers'

RSpec.describe 'Payment ownership and recovery', type: :request do
  include PaymentFoundationHelpers
  let(:cart_id) { SecureRandom.hex(24) }
  let(:location) { Location.create!(name: 'Foundation fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' }) }
  let(:product) { create(:product, published: true, inventory_level: 'variant', allow_pickup: true, allow_shipping: false) }
  let(:variant) { create(:product_variant, product: product, stock_quantity: 10, price_cents: 1250, available: true) }
  let(:attrs) { { customer_name: 'Fixture Guest', customer_email: 'guest@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }
  before do
    configure_payment_fixture!
    CartItem.create!(session_id: cart_id, product_variant: variant, quantity: 2)
  end

  def start_checkout
    post '/api/v1/checkout_sessions', params: { order: attrs }, headers: payment_headers(cart_id)
    expect(response).to have_http_status(:created), response.body
    JSON.parse(response.body)
  end

  it 'persists complete intent before the collection call and returns the same session on retry' do
    expect_any_instance_of(PaymentFoundationHelpers::Provider).to receive(:setup) do |_, attempt:|
      expect(attempt.order).to be_persisted
      expect(attempt.order.order_items.sum(:quantity)).to eq(2)
      { raw_id: "pi_#{attempt.id.delete('-')}", flow: 'stripe_embedded', client_secret: 'fixture_secret' }
    end
    state = start_checkout
    post '/api/v1/checkout_sessions', params: { order: attrs }, headers: payment_headers(cart_id)
    expect(JSON.parse(response.body)['id']).to eq(state['id'])
    expect(Order.count).to eq(1)
    post '/api/v1/checkout_sessions', params: { order: attrs.merge(customer_name: 'Changed') }, headers: payment_headers(cart_id)
    expect(response).to have_http_status(:conflict)
  end

  it 'rejects a stolen session or successful reference without reversing its owner charge' do
    state = start_checkout
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:ok), response.body
    paid = Order.find(state.dig('order', 'id'))
    expect(paid.reload.payment_status).to eq('paid')
    foreign = { 'X-Checkout-Capability' => SecureRandom.hex(32) }
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers: foreign
    expect(response).to have_http_status(:not_found)
    post '/api/v1/orders', params: { order: { payment_intent_id: paid.payment_intent_id } }, headers: foreign
    expect(response).to have_http_status(:conflict)
    expect(paid.reload.payment_status).to eq('paid')
    expect(PaymentOutbox.where(kind: 'compensate')).to be_empty
  end

  it 'recovers a browser-lost payment through the job and commits stock once' do
    state = start_checkout
    expect(variant.reload.stock_quantity).to eq(10)
    attempt = PaymentAttempt.find(state['attempt_id'])
    attempt.update!(next_recovery_at: 1.second.ago)
    PaymentRecoveryJob.perform_now
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers: payment_headers(cart_id)
    expect(variant.reload.stock_quantity).to eq(8)
    expect(InventoryCommitment.where(order_id: attempt.order_id).count).to eq(1)
    expect(PaymentTransaction.where(order_id: attempt.order_id).count).to eq(1)
  end

  it 'preserves cart rows edited or added during collection' do
    state = start_checkout
    old = CartItem.find_by!(session_id: cart_id)
    old.update!(quantity: 3)
    other = create(:product_variant, product: create(:product, published: true), available: true)
    added = CartItem.create!(session_id: cart_id, product_variant: other, quantity: 1)
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers: payment_headers(cart_id)
    effect = PaymentOutbox.find_by!(effect_key: "order:#{state.dig('order', 'id')}:cart_cleanup")
    Payments::DispatchOutbox.call(outbox: effect)
    expect(old.reload.quantity).to eq(3)
    expect(CartItem.exists?(added.id)).to be true
    expect(variant.reload.stock_quantity).to eq(8)
  end

  it 'compensates its own captured attempt when publication changes before finalization' do
    state = start_checkout
    product.update!(published: false)
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers: payment_headers(cart_id)
    attempt = PaymentAttempt.find(state['attempt_id'])
    expect(attempt.compensation_claimed_at).to be_present
    expect(attempt.order.payment_status).to eq('pending')
    expect(variant.reload.stock_quantity).to eq(10)
    Payments::CompensateAttempt.call(attempt: attempt)
    expect(attempt.reload.state).to eq('compensated')
  end

  it 'requires capability access for guests and authenticated ownership for account orders' do
    state = start_checkout
    order = Order.find(state.dig('order', 'id'))
    get "/api/v1/orders/#{order.id}", params: { email: order.customer_email }
    expect(response).to have_http_status(:not_found)
    get "/api/v1/orders/#{order.id}", headers: { 'X-Order-Capability' => @capability }
    expect(response).to have_http_status(:ok)
    order.update!(guest_access_expires_at: 1.second.ago)
    get "/api/v1/orders/#{order.id}", headers: { 'X-Order-Capability' => @capability }
    expect(response).to have_http_status(:not_found)
    account_order = create(:order, :authenticated)
    get "/api/v1/orders/#{account_order.id}", params: { email: account_order.customer_email }
    expect(response).to have_http_status(:not_found)
  end

  it 'allows capability-bound status recovery after collection expiry without exposing collection credentials' do
    state = start_checkout
    session = CheckoutSession.find(state['id'])
    session.update!(expires_at: 1.minute.ago)
    get "/api/v1/checkout_sessions/#{session.id}", headers: payment_headers(cart_id)
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['collection_config']).to eq({})
    get "/api/v1/checkout_sessions/#{session.id}", headers: { 'X-Checkout-Capability' => SecureRandom.hex(32) }
    expect(response).to have_http_status(:not_found)
  end

  it 'blocks disabled storefronts and unpublished/unavailable variants at cart/session boundaries' do
    product.update!(published: false)
    post '/api/v1/cart/items', params: { product_variant_id: variant.id, quantity: 1, location_id: location.id }, headers: { 'X-Session-ID' => cart_id }
    expect(response).to have_http_status(:unprocessable_entity)
    product.update!(published: true)
    SiteSetting.instance.update!(enable_storefront_three_squares: false)
    post '/api/v1/checkout_sessions', params: { order: attrs }, headers: payment_headers(cart_id)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(PaymentAttempt.count).to eq(0)
    SiteSetting.instance.update!(enable_storefront_three_squares: true)
    variant.update!(available: false)
    post '/api/v1/cart/items', params: { product_variant_id: variant.id, quantity: 1 }, headers: { 'X-Session-ID' => cart_id }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it 'rejects unsigned webhooks even outside production' do
    post '/webhooks/stripe', params: { id: 'evt_fixture', type: 'payment_intent.succeeded', data: { object: {} } }.to_json, headers: { 'CONTENT_TYPE' => 'application/json' }
    expect(response).to have_http_status(:bad_request)
  end
end

RSpec.describe 'Payment ingress controls', type: :request do
  include PaymentFoundationHelpers

  it 'rate limits order lookups and checkout creation by IP' do
    previous = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    30.times { get '/api/v1/orders/nonexistent' }
    expect(response).to have_http_status(:not_found)
    get '/api/v1/orders/nonexistent'
    expect(response).to have_http_status(:too_many_requests)
    10.times { post '/api/v1/checkout_sessions', params: { order: { customer_email: 'fixture@example.test' } } }
    post '/api/v1/checkout_sessions', params: { order: { customer_email: 'fixture@example.test' } }
    expect(response).to have_http_status(:too_many_requests)
    60.times { post '/api/v1/checkout_sessions/nonexistent/confirm' }
    post '/api/v1/checkout_sessions/nonexistent/cancel'
    expect(response).to have_http_status(:too_many_requests)
  ensure
    Rack::Attack.cache.store = previous
  end

  it 'converges signed Stripe webhook before POS confirmation through the same inventory commit' do
    configure_payment_fixture!
    admin = create(:user, :admin)
    controller = Api::V1::Admin::PosOrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    location = Location.create!(name: 'POS fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' })
    product = create(:product, published: true, allow_pickup: true, inventory_level: 'variant')
    variant = create(:product_variant, product: product, available: true, stock_quantity: 5, price_cents: 1000)
    post '/api/v1/admin/pos/orders', params: { order: { payment_method: 'card_present', location_id: location.id, items: [{ product_variant_id: variant.id, quantity: 2 }] } }, headers: { 'Idempotency-Key' => SecureRandom.uuid }
    expect(response).to have_http_status(:created), response.body
    order = Order.find(response.parsed_body['id'])
    attempt = PaymentAttempt.find(order.payment_attempt_id)
    expect(order.payment_status).to eq('pending')
    expect(variant.reload.stock_quantity).to eq(5)
    secret = 'fixture_webhook_secret'
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('STRIPE_WEBHOOK_SECRET').and_return(secret)
    event = { id: "evt_#{SecureRandom.hex(8)}", object: 'event', type: 'payment_intent.succeeded', account: @payment_identity.external_account_id,
      livemode: false, data: { object: { id: attempt.raw_provider_id, object: 'payment_intent', metadata: { payment_attempt_id: attempt.id } } } }.to_json
    timestamp = Time.now.to_i
    signature = OpenSSL::HMAC.hexdigest('SHA256', secret, "#{timestamp}.#{event}")
    2.times do
      post '/webhooks/stripe', params: event, headers: { 'CONTENT_TYPE' => 'application/json', 'Stripe-Signature' => "t=#{timestamp},v1=#{signature}" }
      expect(response).to have_http_status(:ok), response.body
    end
    post "/api/v1/admin/pos/orders/#{order.id}/confirm_terminal_payment"
    expect(response).to have_http_status(:ok), response.body
    expect(variant.reload.stock_quantity).to eq(3)
    expect(InventoryCommitment.where(order_id: order.id).count).to eq(1)
    expect(PaymentEvent.count).to eq(1)
  end

  it 'commits idempotent POS cash with no processor and rejects unavailable locations' do
    admin = create(:user, :admin)
    controller = Api::V1::Admin::PosOrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    location = Location.create!(name: 'Cash fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' })
    product = create(:product, published: true, allow_pickup: true, inventory_level: 'variant')
    variant = create(:product_variant, product: product, available: true, stock_quantity: 5, price_cents: 1000)
    key = SecureRandom.uuid
    payload = { order: { payment_method: 'cash', cash_received_cents: 2500, location_id: location.id, items: [{ product_variant_id: variant.id, quantity: 2 }] } }
    2.times do
      post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => key }
      expect(response).to have_http_status(:created), response.body
      expect(response.parsed_body).to include('payment_status' => 'paid', 'cash_change_cents' => 500)
    end
    expect(variant.reload.stock_quantity).to eq(3)
    expect(Order.where(payment_method: 'cash').count).to eq(1)
    location.update!(active: false)
    post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => SecureRandom.uuid }
    expect(response).to have_http_status(:unprocessable_entity), response.body
    expect(variant.reload.stock_quantity).to eq(3)
  end
  it 'persists a definitive POS refusal so the rejected key can never dispatch a delayed payment' do
    configure_payment_fixture!
    location = Location.create!(name: 'Refusal fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' })
    product = create(:product, published: true, allow_pickup: true, inventory_level: 'variant')
    variant = create(:product_variant, product: product, available: true, stock_quantity: 5, price_cents: 1000)
    admin = create(:user, :admin)
    controller = Api::V1::Admin::PosOrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    key = SecureRandom.uuid
    payload = { order: { payment_method: 'card_present', location_id: location.id,
      items: [{ product_variant_id: variant.id, quantity: 999 }] } }
    post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => key }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body).to include('outcome' => 'rejected', 'no_attempt' => true)
    expect(RejectedPaymentRequest.count).to eq(1)
    expect(PaymentAttempt.count).to eq(0)
    payload[:order][:items][0][:quantity] = 1
    post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => key }
    expect(response.parsed_body).to include('outcome' => 'rejected', 'no_attempt' => true)
    expect(PaymentAttempt.count).to eq(0)
  end

  it 'returns a closed expired POS attempt on creation replay without invoking setup again' do
    configure_payment_fixture!
    admin = create(:user, :admin)
    controller = Api::V1::Admin::PosOrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    location = Location.create!(name: 'Expired POS fixture', slug: SecureRandom.hex(6), active: true, hours_json: { 'Daily' => '00:00-23:59' })
    product = create(:product, published: true, allow_pickup: true, inventory_level: 'variant')
    variant = create(:product_variant, product: product, available: true, stock_quantity: 5, price_cents: 1000)
    key = SecureRandom.uuid
    payload = { order: { payment_method: 'card_present', location_id: location.id, items: [{ product_variant_id: variant.id, quantity: 1 }] } }
    post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => key }
    expect(response).to have_http_status(:created), response.body
    order = Order.find(response.parsed_body['id'])
    attempt = PaymentAttempt.find(order.payment_attempt_id)
    attempt.update!(state: 'cancelled', raw_provider_id: nil, dispatched_at: nil, collection_config: {})
    attempt.checkout_session.update!(expires_at: 1.minute.ago)
    expect_any_instance_of(PaymentFoundationHelpers::Provider).not_to receive(:setup)
    post '/api/v1/admin/pos/orders', params: payload, headers: { 'Idempotency-Key' => key }
    expect(response).to have_http_status(:created), response.body
    expect(response.parsed_body).to include('id' => order.id, 'payment_state' => 'cancelled')
    expect(response.parsed_body['client_secret']).to be_nil
    post "/api/v1/admin/pos/orders/#{order.id}/confirm_terminal_payment"
    expect(response.parsed_body['payment_state']).to eq('cancelled')
    expect(Order.count).to eq(1)
  end

  it 'reports and persists manual stock restoration for a verified successful legacy refund' do
    admin = create(:user, :admin)
    controller = Api::V1::Admin::OrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    order = create(:order, payment_status: 'paid', payment_method: 'stripe', payment_intent_id: 'pi_legacyfixture')
    allow(PaymentService).to receive(:refund_payment) do |**args|
      refund = Refund.create!(order: args[:order], amount_cents: args[:amount_cents], status: 'succeeded', user: admin)
      { success: true, refund: refund }
    end
    post "/api/v1/admin/orders/#{order.id}/refund", params: { amount_cents: order.total_cents }
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body).to include('inventory_restored' => false, 'inventory_restoration_required' => true, 'inventory_restoration_status' => 'manual_review_required')
    expect(order.reload.metadata.dig('inventory_restoration', 'status')).to eq('manual_review_required')
    expect(order.refunds.first.metadata.dig('inventory_restoration', 'status')).to eq('manual_review_required')
  end

end
