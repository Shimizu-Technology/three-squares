require 'rails_helper'

RSpec.describe 'Staff fulfillment transitions', type: :request do
  let(:admin) { create(:user, :admin) }
  let(:location) { create(:location) }
  before do
    controller = Api::V1::Admin::OrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
  end

  def transition(order, status)
    patch "/api/v1/admin/orders/#{order.id}", params: { order: { status: status } }
  end

  %w[retail wholesale pickup dine_in].each do |type|
    it "completes a paid #{type} pickup without offering shipping and preserves its representation" do
      order = create(:order, order_type: type, fulfillment_type: 'pickup', location: location, payment_status: 'paid', simulated: true)
      create(:order_item, order: order, quantity: 3)
      get '/api/v1/admin/orders'
      original = response.parsed_body['orders'].find { |row| row['id'] == order.id }
      expect(original).to include('next_status_options' => %w[confirmed cancelled], 'item_count' => 3, 'line_count' => 1)
      %w[confirmed ready picked_up].each do |status|
        transition(order, status)
        expect(response).to have_http_status(:ok)
        row = response.parsed_body['order']
        %w[location_id location_name business_line item_count line_count order_items].each { |key| expect(row[key]).to eq(original[key]) }
        expect(order.reload.status).to eq(status)
      end
      expect(response.parsed_body['order']['next_status_options']).to eq([])
    end
  end

  it 'rejects skipped, backward, cross-fulfillment and terminal transitions without saving notes' do
    order = create(:order, fulfillment_type: 'pickup', location: location, payment_status: 'paid', simulated: true)
    %w[ready picked_up processing shipped delivered].each do |status|
      patch "/api/v1/admin/orders/#{order.id}", params: { order: { status: status, admin_notes: 'must not save' } }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(order.reload.status).to eq('pending')
      expect(order.admin_notes).to be_nil
    end
    transition(order, 'confirmed')
    transition(order, 'pending')
    expect(response).to have_http_status(:unprocessable_entity)
    transition(order, 'cancelled')
    expect(response).to have_http_status(:ok)
    transition(order, 'confirmed')
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it 'keeps unpaid fulfillment separate but permits cancellation and notes-only updates' do
    order = create(:order, fulfillment_type: 'pickup', location: location)
    transition(order, 'confirmed')
    expect(response).to have_http_status(:unprocessable_entity)
    patch "/api/v1/admin/orders/#{order.id}", params: { order: { admin_notes: 'Call before pickup' } }
    expect(response).to have_http_status(:ok)
    transition(order, 'cancelled')
    expect(response).to have_http_status(:ok)
  end

  it 'keeps shipping on its own sequence and recovers legacy processing pickups' do
    order = create(:order, fulfillment_type: 'shipping', payment_status: 'paid', simulated: true)
    transition(order, 'confirmed')
    expect(response).to have_http_status(:unprocessable_entity)
    %w[processing shipped delivered].each do |status|
      transition(order, status)
      expect(response).to have_http_status(:ok)
    end
    transition(order, 'processing')
    expect(response).to have_http_status(:unprocessable_entity)
    pickup = create(:order, status: 'processing', fulfillment_type: 'pickup', location: location, payment_status: 'paid', simulated: true)
    transition(pickup, 'ready')
    expect(response).to have_http_status(:ok)
  end
  it 'includes saved shipping tracking and staff notes in the list contract' do
    order = create(:order, fulfillment_type: 'shipping', status: 'shipped', payment_status: 'paid',
                    tracking_number: 'USPS: QA-TRACK-123', admin_notes: 'Pack the cookie tins upright')
    get '/api/v1/admin/orders', params: { fulfillment_type: 'shipping' }
    expect(response).to have_http_status(:ok)
    row = response.parsed_body.fetch('orders').find { |item| item['id'] == order.id }
    expect(row).to include('tracking_number' => order.tracking_number, 'admin_notes' => order.admin_notes)
    get "/api/v1/admin/orders/#{order.id}"
    expect(response.parsed_body.fetch('order').slice('tracking_number', 'admin_notes')).to eq(row.slice('tracking_number', 'admin_notes'))
  end

end
