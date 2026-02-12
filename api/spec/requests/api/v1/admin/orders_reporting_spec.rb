require 'rails_helper'

RSpec.describe 'Admin orders reporting', type: :request do
  let(:admin_user) { create(:user, :admin) }
  let!(:cookies_collection) { Collection.find_or_create_by!(slug: 'cookies') { |c| c.name = 'Cookies' } }
  let!(:mains_collection) { Collection.find_or_create_by!(slug: 'mains') { |c| c.name = 'Mains' } }
  let!(:pickup_location) { Location.create!(name: "Main #{SecureRandom.hex(2)}", slug: "main-#{SecureRandom.hex(4)}", active: true) }

  before do
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:current_user).and_return(admin_user)
  end

  def create_retail_order_with_collection(collection:, fulfillment_type:, location: nil, total_cents: 2500)
    product = create(
      :product,
      slug: "report-product-#{SecureRandom.hex(4)}",
      published: true,
      archived: false
    )
    create(:product_collection, product: product, collection: collection)
    variant = create(:product_variant, product: product, price_cents: total_cents)

    order = create(
      :order,
      order_type: 'retail',
      fulfillment_type: fulfillment_type,
      payment_status: 'paid',
      total_cents: total_cents,
      subtotal_cents: total_cents,
      shipping_cost_cents: 0,
      location: location
    )

    create(
      :order_item,
      order: order,
      product: product,
      product_variant: variant,
      quantity: 1,
      unit_price_cents: total_cents,
      total_price_cents: total_cents
    )

    order
  end

  it 'returns filtered queue summary counts' do
    create_retail_order_with_collection(
      collection: mains_collection,
      fulfillment_type: 'pickup',
      location: pickup_location,
      total_cents: 2200
    )
    create_retail_order_with_collection(
      collection: cookies_collection,
      fulfillment_type: 'shipping',
      location: nil,
      total_cents: 3400
    )

    get '/api/v1/admin/orders/summary', params: {
      fulfillment_type: 'pickup',
      location_id: pickup_location.id,
      business_line: 'three_squares'
    }

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json['total_orders']).to eq(1)
    expect(json['paid_orders']).to eq(1)
    expect(json['total_revenue_cents']).to eq(2200)
    expect(json['status_counts']).to include('pending' => 1)
  end

  it 'exports csv for filtered business line orders' do
    matching_order = create_retail_order_with_collection(
      collection: cookies_collection,
      fulfillment_type: 'shipping',
      total_cents: 3100
    )
    create_retail_order_with_collection(
      collection: mains_collection,
      fulfillment_type: 'pickup',
      location: pickup_location,
      total_cents: 2100
    )

    get '/api/v1/admin/orders/export', params: { business_line: 'latte_stone' }

    expect(response).to have_http_status(:ok)
    expect(response.headers['Content-Type']).to include('text/csv')
    expect(response.body).to include('order_number,created_at,status,payment_status,order_type,business_line')
    expect(response.body).to include(matching_order.order_number)
    expect(response.body).to include('latte_stone')
    expect(response.body).not_to include('three_squares')
  end
end

