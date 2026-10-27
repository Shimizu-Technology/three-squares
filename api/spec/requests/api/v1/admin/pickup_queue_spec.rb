require 'rails_helper'

RSpec.describe 'Live pickup stage queries', type: :request do
  let(:admin) { create(:user, :admin) }
  let(:main) { create(:location) }
  let(:donki) { create(:location) }
  before do
    controller = Api::V1::Admin::OrdersController
    allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(controller).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(controller).to receive(:current_user).and_return(admin)
    [['pending','paid'],['pending','pending'],['pending','failed'],['confirmed','paid'],['processing','paid'],['ready','paid'],['picked_up','paid'],['cancelled','paid']].each do |status,payment|
      create(:order, payment_environment:'production', fulfillment_type:'pickup', location:main, status:status, payment_status:payment)
    end
    create(:order, payment_environment:'production', fulfillment_type:'pickup', location:donki, payment_status:'paid')
    create(:order, payment_environment:'production', fulfillment_type:'shipping', payment_status:'paid')
  end

  it 'counts every paid pickup stage and waiting payment independently of selected stage, within location context' do
    get '/api/v1/admin/orders/summary', params:{fulfillment_type:'pickup',location_id:main.id,queue_stage:'ready'}
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['queue_stage_counts']).to eq('new_paid'=>1,'confirmed'=>2,'ready'=>1,'picked_up'=>1,'waiting_payment'=>2,'all_active'=>4)
    expect(response.parsed_body['total_orders']).to eq(8)
  end

  it 'separates new paid from waiting and keeps list, count and export in the same selected stage' do
    %w[new_paid waiting_payment confirmed ready picked_up all_active].zip([1,2,2,1,1,4]).each do |stage,total|
      params={fulfillment_type:'pickup',location_id:main.id,queue_stage:stage}
      get '/api/v1/admin/orders', params:params
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['pagination']['total_count']).to eq(total)
      ids=response.parsed_body['orders'].map{|row|row['order_number']}
      get '/api/v1/admin/orders/export', params:params
      expect(response).to have_http_status(:ok)
      expect(CSV.parse(response.body,headers:true).map{|row|row['order_number']}).to match_array(ids)
    end
  end

  it 'cannot broaden a scoped staff queue through a forged location filter' do
    create(:user, :owner)
    admin.update!(role: "staff", assigned_location:main)
    get '/api/v1/admin/orders/summary',params:{fulfillment_type:'pickup',location_id:donki.id,queue_stage:'new_paid'}
    expect(response.parsed_body['queue_stage_counts']['new_paid']).to eq(0)
    expect(response.parsed_body['total_orders']).to eq(0)
    expect(response.parsed_body).not_to have_key('total_revenue_cents')
  end
end
