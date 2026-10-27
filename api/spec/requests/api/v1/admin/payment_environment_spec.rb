require 'rails_helper'

RSpec.describe 'Admin order payment environment', type: :request do
  let(:admin) { create(:user, :admin) }

  before do
    controller = Api::V1::Admin::OrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
  end

  %w[production sandbox simulated].each do |environment|
    it "exposes the frozen #{environment} payment identity on list and detail without allowing edits" do
      order = create(:order, payment_environment: environment, payment_provider: 'worldpay', simulated: environment == 'simulated')
      expected = { 'payment_environment' => environment, 'payment_provider' => 'worldpay' }

      get '/api/v1/admin/orders'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['orders'].find { |row| row['id'] == order.id }).to include(expected)

      get "/api/v1/admin/orders/#{order.id}"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['order']).to include(expected)

      patch "/api/v1/admin/orders/#{order.id}", params: { order: {
        admin_notes: 'Read-only identity check', payment_environment: 'sandbox', payment_provider: 'stripe'
      } }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['order']).to include(expected)
      expect(order.reload.attributes.slice('payment_environment', 'payment_provider')).to eq(expected)
    end
  end
end
