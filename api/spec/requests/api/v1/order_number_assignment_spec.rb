require 'rails_helper'
require_relative '../../../support/payment_foundation_helpers'

RSpec.describe 'Order numbers across creation paths', type: :request do
  include PaymentFoundationHelpers
  include ActiveSupport::Testing::TimeHelpers

  let!(:location) { create(:location, hours_json: { 'Daily' => '00:00-23:59' }) }
  let!(:staff) { create(:user, :owner, assigned_location: location) }
  let!(:product) { create(:product, product_type: 'local', published: true, allow_pickup: true, inventory_level: 'variant') }
  let!(:variant) { create(:product_variant, product: product, stock_quantity: 50, price_cents: 1200) }
  let(:attributes) { { customer_name: 'Fixture', customer_email: 'fixture@example.test', customer_phone: '6715550100', fulfillment_type: 'pickup', location_id: location.id } }
  let(:pos_attributes) { { payment_method: 'cash', location_id: location.id, items: [ { product_variant_id: variant.id, quantity: 1 } ] } }

  before do
    travel_to Time.utc(2026, 10, 28, 2)
    configure_payment_fixture!
    ProductLocation.create!(product: product, location: location, available: true)
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise 'External HTTP forbidden' }
    @previous_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    client = double('Clerk client', users: double('Clerk users'))
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token).with('number-fixture').and_return({ 'sub' => staff.clerk_id })
    allow(client.users).to receive(:find).with(staff.clerk_id).and_return({ 'primary_email_address_id' => 'email', 'email_addresses' => [ { 'id' => 'email', 'email_address' => staff.email } ] })
  end

  after do
    travel_back
    ActiveJob::Base.queue_adapter = @previous_adapter
  end

  def staff_headers
    { 'Authorization' => 'Bearer number-fixture', 'Idempotency-Key' => @request_key }
  end

  def online_request(authenticated: false)
    @cart ||= CartItem.create!(session_id: SecureRandom.uuid, user: authenticated ? staff : nil, product_variant: variant, quantity: 1)
    headers = payment_headers(@cart.session_id)
    headers.merge!(staff_headers) if authenticated
    post '/api/v1/checkout_sessions', params: { order: attributes }, headers: headers, as: :json
  end

  # Force a genuine PG unique violation AFTER validation to exercise the last
  # line of defense, including savepoint/outer-transaction rollback behavior.
  def force_number_collision
    existing = create(:order, fulfillment_type: 'shipping', order_number: 'TSQ-R-20261028-0001')
    allow_any_instance_of(Order).to receive(:_create_record).and_wrap_original do |original, *args, **kwargs|
      original.receiver.order_number = existing.order_number
      original.call(*args, **kwargs)
    end
  end

  it 'numbers and finalizes a cash POS sale without changing replay or stock behavior' do
    2.times do
      post '/api/v1/admin/pos/orders', params: { order: pos_attributes }, headers: staff_headers, as: :json
      expect(response).to have_http_status(:created), response.body
      expect(response.parsed_body.fetch('order_number')).to eq('TSQ-P-20261028-0001')
    end
    expect(Order.count).to eq(1)
    expect(Order.last.payment_status).to eq('paid')
    expect(variant.reload.stock_quantity).to eq(49)
  end

  it 'numbers a card POS intent and preserves its session, attempt and reservation' do
    post '/api/v1/admin/pos/orders', params: { order: pos_attributes.merge(payment_method: 'card_online') }, headers: staff_headers, as: :json
    expect(response).to have_http_status(:created), response.body
    order = Order.last
    expect(order.order_number).to eq('TSQ-P-20261028-0001')
    expect(order.payment_attempt_id).to be_present
    expect(order.checkout_session_id).to be_present
    expect(InventoryReservation.where(order_id: order.id, state: 'held').sum(:quantity)).to eq(1)
    expect(variant.reload.stock_quantity).to eq(50)
  end

  [ false, true ].each do |authenticated|
    it "numbers #{authenticated ? 'staff' : 'guest'} checkout and preserves its number through compatibility completion" do
      online_request(authenticated: authenticated)
      expect(response).to have_http_status(:created), response.body
      session_id = response.parsed_body.fetch('id')
      order = Order.last
      expect(order.order_number).to eq('TSQ-R-20261028-0001')
      post '/api/v1/orders', params: { order: { checkout_session_id: session_id } },
        headers: authenticated ? staff_headers : payment_headers, as: :json
      expect(response).to have_http_status(:created), response.body
      expect(order.reload).to have_attributes(order_number: 'TSQ-R-20261028-0001', payment_status: 'paid')
      expect(Order.count).to eq(1)
      expect(variant.reload.stock_quantity).to eq(49)
    end
  end

  [ :pos, :checkout, :staff_checkout ].each do |path|
    it "returns a retriable 409 and rolls back #{path} if a number collision bypasses the lock" do
      force_number_collision
      if path == :pos
        post '/api/v1/admin/pos/orders', params: { order: pos_attributes }, headers: staff_headers, as: :json
      else
        online_request(authenticated: path == :staff_checkout)
      end
      expect(response).to have_http_status(:conflict), response.body
      expect(response.parsed_body).to include('outcome' => 'unknown', 'error' => 'Order number is busy. Please retry your request.')
      expect(Order.count).to eq(1)
      expect(CheckoutSession.count).to eq(0)
      expect(CheckoutRequest.count).to eq(0)
      expect(RejectedPaymentRequest.count).to eq(0)
      expect(PaymentAttempt.count).to eq(0)
      expect(InventoryReservation.count).to eq(0)
      expect(variant.reload.stock_quantity).to eq(50)
      # The existing UI retains the same request key on 409; it can now retry.
      allow_any_instance_of(Order).to receive(:_create_record).and_call_original
      if path == :pos
        post '/api/v1/admin/pos/orders', params: { order: pos_attributes }, headers: staff_headers, as: :json
      else
        online_request(authenticated: path == :staff_checkout)
      end
      expect(response).to have_http_status(:created), response.body
    end
  end

  it 'does not label an unrelated unique violation as an order-number conflict' do
    existing = create(:order, fulfillment_type: 'shipping')
    allow_any_instance_of(Order).to receive(:_create_record).and_wrap_original do |original, *args, **kwargs|
      original.receiver.id = existing.id
      original.call(*args, **kwargs)
    end
    expect { online_request }.to raise_error(ActiveRecord::RecordNotUnique) { |error|
      expect(error.cause.result.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME)).to eq('orders_pkey')
    }
  end
end
