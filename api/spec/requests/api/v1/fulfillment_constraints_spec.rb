require 'rails_helper'

RSpec.describe 'Fulfillment constraints', type: :request do
  let(:session_id) { "session-#{SecureRandom.hex(6)}" }
  let(:headers) { { 'X-Session-ID' => session_id } }
  let(:location) { Location.create!(name: 'Main Store', slug: "main-#{SecureRandom.hex(4)}", active: true) }

  before do
    SiteSetting.instance.update!(payment_test_mode: true)
  end

  def create_product_with_variant(attrs = {})
    product = create(
      :product,
      name: attrs.fetch(:name, "Product #{SecureRandom.hex(3)}"),
      slug: attrs.fetch(:slug, "product-#{SecureRandom.hex(4)}"),
      base_price_cents: 1200,
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
      price_cents: 1200,
      available: true,
      weight_oz: 5.0
    )

    [ product, variant ]
  end

  def add_cart_item!(variant, quantity: 1)
    CartItem.create!(
      session_id: session_id,
      product_variant: variant,
      quantity: quantity
    )
  end

  describe 'POST /api/v1/cart/items (mixed fulfillment block)' do
    it 'rejects adding incompatible fulfillment item to an existing cart' do
      pickup_product, pickup_variant = create_product_with_variant(
        name: 'Pickup Product',
        slug: "pickup-#{SecureRandom.hex(3)}",
        allow_pickup: true,
        allow_shipping: false
      )
      ProductLocation.create!(product: pickup_product, location: location, available: true)
      add_cart_item!(pickup_variant)

      _, shipping_variant = create_product_with_variant(
        name: 'Shipping Product',
        slug: "shipping-#{SecureRandom.hex(3)}",
        allow_pickup: false,
        allow_shipping: true
      )

      post '/api/v1/cart/items',
           params: { product_variant_id: shipping_variant.id, quantity: 1 },
           headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      json = JSON.parse(response.body)
      expect(json['error']).to include('cannot be combined')
    end
  end

  describe 'POST /api/v1/orders' do
    let(:base_order_params) do
      {
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        customer_phone: '671-555-0199',
        special_instructions: '',
        shipping_address: {
          name: 'Test Customer',
          street1: '123 Main St',
          city: 'Tamuning',
          state: 'GU',
          zip: '96913',
          country: 'US',
          phone: '671-555-0199'
        },
        shipping_method: {
          service: 'Standard',
          rate_cents: 0
        },
        payment_method: {
          type: 'test',
          token: 'tok_visa'
        }
      }
    end

    it 'requires a location for pickup orders' do
      product, variant = create_product_with_variant(
        name: 'Pickup Only',
        slug: "pickup-only-#{SecureRandom.hex(3)}",
        allow_pickup: true,
        allow_shipping: false
      )
      ProductLocation.create!(product: product, location: location, available: true)
      add_cart_item!(variant)

      post '/api/v1/orders',
           params: { order: base_order_params.merge(fulfillment_type: 'pickup', location_id: nil) },
           headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Cart fulfillment validation failed')
      expect(json['issues'].map { |issue| issue['type'] }).to include('location_required')
    end

    it 'rejects pickup at locations where items are unavailable' do
      product, variant = create_product_with_variant(
        name: 'Location Scoped Item',
        slug: "location-scoped-#{SecureRandom.hex(3)}",
        allow_pickup: true,
        allow_shipping: false
      )
      ProductLocation.create!(product: product, location: location, available: false)
      add_cart_item!(variant)

      post '/api/v1/orders',
           params: { order: base_order_params.merge(fulfillment_type: 'pickup', location_id: location.id) },
           headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Cart fulfillment validation failed')
      expect(json['issues'].map { |issue| issue['type'] }).to include('location_unavailable')
    end
  end

  describe 'POST /api/v1/payment_intents' do
    it 'rejects unsupported shipping fulfillment for pickup-only items' do
      product, variant = create_product_with_variant(
        name: 'Pickup Item',
        slug: "pickup-item-#{SecureRandom.hex(3)}",
        allow_pickup: true,
        allow_shipping: false
      )
      ProductLocation.create!(product: product, location: location, available: true)
      add_cart_item!(variant)

      post '/api/v1/payment_intents',
           params: {
             email: 'test@example.com',
             shipping_cost: 0,
             fulfillment_type: 'shipping',
             location_id: nil
           },
           headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Cart fulfillment validation failed')
      expect(json['issues'].map { |issue| issue['type'] }).to include('fulfillment_not_supported')
    end
  end
end

