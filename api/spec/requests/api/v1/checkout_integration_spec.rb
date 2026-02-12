require 'rails_helper'

RSpec.describe 'Checkout integration', type: :request do
  let(:session_id) { "checkout-session-#{SecureRandom.hex(6)}" }
  let(:headers) { { 'X-Session-ID' => session_id } }
  let(:pickup_location) { Location.create!(name: 'Main Store', slug: "main-#{SecureRandom.hex(4)}", active: true) }

  before do
    SiteSetting.instance.update!(payment_test_mode: true)
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

    post '/api/v1/payment_intents',
         params: {
           email: 'integration@example.com',
           fulfillment_type: 'shipping',
           shipping_cost_cents: 500
         },
         headers: headers

    expect(response).to have_http_status(:ok)
    payment_json = JSON.parse(response.body)
    expect(payment_json['amount_cents']).to eq(3500)
    expect(payment_json['payment_intent_id']).to be_present

    post '/api/v1/orders',
         params: {
           order: base_order_payload.merge(
             fulfillment_type: 'shipping',
             location_id: nil
           )
         },
         headers: headers

    expect(response).to have_http_status(:created)
    order_json = JSON.parse(response.body)
    expect(order_json['order']['fulfillment_type']).to eq('shipping')
    expect(order_json['order']['location']).to be_nil
    expect(order_json['order']['shipping_cost_cents']).to eq(500)
    expect(order_json['order']['total_cents']).to eq(3500)
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

    post '/api/v1/payment_intents',
         params: {
           email: 'integration@example.com',
           fulfillment_type: 'pickup',
           location_id: pickup_location.id,
           shipping_cost_cents: 500
         },
         headers: headers

    expect(response).to have_http_status(:ok)
    payment_json = JSON.parse(response.body)
    expect(payment_json['amount_cents']).to eq(1800)

    post '/api/v1/orders',
         params: {
           order: base_order_payload.merge(
             fulfillment_type: 'pickup',
             location_id: pickup_location.id
           )
         },
         headers: headers

    expect(response).to have_http_status(:created)
    order_json = JSON.parse(response.body)
    expect(order_json['order']['fulfillment_type']).to eq('pickup')
    expect(order_json['order']['location']).to be_present
    expect(order_json['order']['location']['id']).to eq(pickup_location.id)
    expect(order_json['order']['shipping_cost_cents']).to eq(0)
    expect(order_json['order']['total_cents']).to eq(1800)
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

    post '/api/v1/payment_intents',
         params: {
           email: 'integration@example.com',
           fulfillment_type: 'shipping',
           shipping_cost_cents: 0
         },
         headers: headers

    expect(response).to have_http_status(:unprocessable_entity)
    payment_json = JSON.parse(response.body)
    expect(payment_json['error']).to eq('Cart fulfillment validation failed')
    expect(payment_json['issues'].map { |issue| issue['type'] }).to include('mixed_fulfillment')
  end
end

