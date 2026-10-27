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
      payment_environment: 'production',
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

  it 'includes only explicit production money in summary revenue and CSV' do
    production = create_retail_order_with_collection(collection: mains_collection, fulfillment_type: 'pickup', location: pickup_location, total_cents: 2200)
    excluded = ['sandbox', 'simulated', nil].map do |environment|
      order = create_retail_order_with_collection(collection: mains_collection, fulfillment_type: 'pickup', location: pickup_location, total_cents: 9900)
      order.update_columns(payment_environment: environment, simulated: environment == 'simulated')
      order
    end
    get '/api/v1/admin/orders/summary'
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['total_revenue_cents']).to eq(2200)
    get '/api/v1/admin/orders/export'
    expect(response).to have_http_status(:ok)
    numbers = CSV.parse(response.body, headers: true).map { |row| row['order_number'] }
    expect(numbers).to eq([production.order_number])
    expect(numbers & excluded.map(&:order_number)).to be_empty
  end
  it 'keeps admin listing query counts constant as independently associated products grow' do
    measure = lambda do
      queries = []
      callback = ->(_name, _start, _finish, _id, payload) { queries << payload[:sql] if payload[:sql].match?(/\ASELECT/i) && payload[:name] != 'SCHEMA' && !payload[:cached] }
      ActiveSupport::Notifications.subscribed(callback, 'sql.active_record') { get '/api/v1/admin/orders' }
      expect(response).to have_http_status(:ok)
      queries.size
    end
    admin_user # Exclude lazy test authentication setup from the measurement.
    3.times { create_retail_order_with_collection(collection: cookies_collection, fulfillment_type: 'shipping') }
    initial = measure.call
    4.times { create_retail_order_with_collection(collection: cookies_collection, fulfillment_type: 'shipping') }
    expect(measure.call).to eq(initial)
  end

  it 'keeps dated cookie shipping list, summary, export and legacy listing consistent' do
    matching = 2.times.map do
      order = create_retail_order_with_collection(collection: cookies_collection, fulfillment_type: 'shipping', total_cents: 3100)
      order.update_columns(status: 'processing', created_at: Time.current.change(hour: 12))
      # Multiple matching lines must still count each order and its revenue once.
      item = order.order_items.first
      create(:order_item, order: order, product: item.product, product_variant: item.product_variant)
      order
    end
    old = create_retail_order_with_collection(collection: cookies_collection, fulfillment_type: 'shipping')
    old.update_columns(status: 'processing', created_at: 2.days.ago)
    create_retail_order_with_collection(collection: mains_collection, fulfillment_type: 'pickup', location: pickup_location)
    filters = { business_line: 'latte_stone', fulfillment_type: 'shipping', status: 'processing',
                start_date: Date.current.iso8601, end_date: Date.current.iso8601 }

    get '/api/v1/admin/orders', params: filters
    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json.fetch('orders').map { |order| order.fetch('id') }).to match_array(matching.map(&:id))
    expect(json.dig('pagination', 'total_count')).to eq(2)

    get '/api/v1/admin/orders/summary', params: filters
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)).to include('total_orders' => 2, 'paid_orders' => 2,
                                                'total_revenue_cents' => 6200, 'status_counts' => { 'processing' => 2 })

    get '/api/v1/admin/orders/export', params: filters
    expect(response).to have_http_status(:ok)
    expect(CSV.parse(response.body, headers: true).map { |row| row['order_number'] }).to match_array(matching.map(&:order_number))

    allow_any_instance_of(Api::V1::OrdersController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::OrdersController).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(Api::V1::OrdersController).to receive(:current_user).and_return(admin_user)
    get '/api/v1/orders', params: filters
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('orders').map { |order| order.fetch('id') }).to match_array(matching.map(&:id))
  end

end

