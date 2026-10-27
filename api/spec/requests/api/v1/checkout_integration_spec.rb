require 'rails_helper'
require_relative '../../../support/payment_foundation_helpers'

RSpec.describe 'Checkout integration', type: :request do
  include PaymentFoundationHelpers
  let(:session_id) { "checkout-session-#{SecureRandom.hex(6)}" }
  let(:headers) { payment_headers(session_id) }
  let(:pickup_location) { Location.create!(name: 'Main Store', slug: "main-#{SecureRandom.hex(4)}", active: true, hours_json: { "Daily" => "00:00-23:59" }) }

  before do
    configure_payment_fixture!
    allow(ShippingService).to receive(:calculate_rates).and_return([{ carrier: 'Fixture', service: 'Standard', rate_cents: 500, rate_id: 'fixture-rate' }])
  end

  def create_product_with_variant(attrs = {})
    product = create(
      :product,
      name: attrs.fetch(:name, "Product #{SecureRandom.hex(3)}"),
      slug: attrs.fetch(:slug, "product-#{SecureRandom.hex(4)}"),
      base_price_cents: attrs.fetch(:price_cents, 1200),
      published: true,
      inventory_level: 'none',
      allow_pickup: attrs.fetch(:allow_pickup, true),
      allow_shipping: attrs.fetch(:allow_shipping, true)
    )

    variant = ProductVariant.create!(
      product: product,
      variant_key: "default-#{SecureRandom.hex(2)}",
      variant_name: 'Default',
      sku: "SKU-#{SecureRandom.hex(5)}",
      price_cents: attrs.fetch(:price_cents, 1200),
      available: true,
      weight_oz: 5.0
    )

    if attrs.fetch(:allow_pickup, true)
      ProductLocation.create!(
        product: product,
        location: pickup_location,
        available: attrs.fetch(:pickup_available, true)
      )
    end

    [ product, variant ]
  end

  def add_cart_item!(variant, quantity: 1)
    CartItem.create!(
      session_id: session_id,
      product_variant: variant,
      quantity: quantity
    )
  end

  def base_order_payload
    {
      customer_name: 'Integration Tester',
      customer_email: 'integration@example.com',
      customer_phone: '671-555-0199',
      special_instructions: '',
      shipping_address: {
        name: 'Integration Tester',
        street1: '123 Main St',
        city: 'Tamuning',
        state: 'GU',
        zip: '96913',
        country: 'US',
        phone: '671-555-0199'
      },
      shipping_method: {
        carrier: 'Fixture',
        service: 'Standard',
        rate_cents: 500
      },
      payment_method: {
        type: 'test',
        token: 'tok_visa'
      }
    }
  end

  it 'completes shipping checkout flow end-to-end' do
    _, variant = create_product_with_variant(
      name: 'Shipping Item',
      slug: "shipping-flow-#{SecureRandom.hex(3)}",
      allow_pickup: false,
      allow_shipping: true,
      price_cents: 1500
    )
    add_cart_item!(variant, quantity: 2)

    post '/api/v1/checkout_sessions', params: { order: base_order_payload.merge(fulfillment_type: 'shipping', location_id: nil) }, headers: headers
    expect(response).to have_http_status(:created)
    payment_json = JSON.parse(response.body)
    expect(payment_json['amount_cents']).to eq(3500)
    pending = Order.find(payment_json.dig('order', 'id'))
    expect(pending.payment_status).to eq('pending')
    expect(pending.order_items.sum(:quantity)).to eq(2)
    post "/api/v1/checkout_sessions/#{payment_json['id']}/confirm", headers: headers
    expect(response).to have_http_status(:ok)
    pending.reload
    expect(pending.fulfillment_type).to eq('shipping')
    expect(pending.location).to be_nil
    expect(pending.shipping_cost_cents).to eq(500)
    expect(pending.total_cents).to eq(3500)
    Payments::DispatchOutbox.call(outbox: PaymentOutbox.find_by!(effect_key: "order:#{pending.id}:cart_cleanup"))
    expect(CartItem.where(session_id: session_id)).to be_empty
  end

  it 'completes pickup checkout flow end-to-end' do
    _, variant = create_product_with_variant(
      name: 'Pickup Item',
      slug: "pickup-flow-#{SecureRandom.hex(3)}",
      allow_pickup: true,
      allow_shipping: false,
      price_cents: 1800
    )
    add_cart_item!(variant, quantity: 1)

    post '/api/v1/checkout_sessions', params: { order: base_order_payload.merge(fulfillment_type: 'pickup', location_id: pickup_location.id) }, headers: headers
    expect(response).to have_http_status(:created)
    payment_json = JSON.parse(response.body)
    expect(payment_json['amount_cents']).to eq(1800)
    post "/api/v1/checkout_sessions/#{payment_json['id']}/confirm", headers: headers
    expect(response).to have_http_status(:ok)
    order = Order.find(payment_json.dig('order', 'id'))
    expect(order.fulfillment_type).to eq('pickup')
    expect(order.location_id).to eq(pickup_location.id)
    expect(order.shipping_cost_cents).to eq(0)
    expect(order.total_cents).to eq(1800)
    Payments::DispatchOutbox.call(outbox: PaymentOutbox.find_by!(effect_key: "order:#{order.id}:cart_cleanup"))
    expect(CartItem.where(session_id: session_id)).to be_empty
  end

  it 'blocks checkout when cart contains mixed incompatible fulfillment items' do
    _, pickup_variant = create_product_with_variant(
      name: 'Pickup Only',
      slug: "pickup-mixed-#{SecureRandom.hex(3)}",
      allow_pickup: true,
      allow_shipping: false
    )
    _, shipping_variant = create_product_with_variant(
      name: 'Shipping Only',
      slug: "shipping-mixed-#{SecureRandom.hex(3)}",
      allow_pickup: false,
      allow_shipping: true
    )

    # Bypass add_item guard to simulate legacy/edge-state mixed carts.
    add_cart_item!(pickup_variant, quantity: 1)
    add_cart_item!(shipping_variant, quantity: 1)

    post '/api/v1/checkout_sessions', params: { order: base_order_payload.merge(fulfillment_type: 'shipping') }, headers: headers

    expect(response).to have_http_status(:unprocessable_entity)
    payment_json = JSON.parse(response.body)
    expect(payment_json['error']).to eq('Your cart cannot mix shippable and pickup-only items. Please keep to one fulfillment path.')
    expect(PaymentAttempt.count).to eq(0)
  end
end

