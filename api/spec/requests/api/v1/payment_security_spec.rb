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
