require "rails_helper"
require_relative "../../../../support/refund_fixtures"

RSpec.describe "Admin refund requests", type: :request do
  include RefundFixtures
  let(:fixture) { captured_order }
  let(:order) { fixture.first }
  let(:provider) { double("refund provider") }
  before do
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:authenticate_request).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:require_admin!).and_return(true)
    allow_any_instance_of(Api::V1::Admin::OrdersController).to receive(:current_user).and_return(create(:user, :admin))
    allow(Payments::ProviderResolver).to receive(:for_identity).and_return(provider)
    allow(provider).to receive(:refund).and_return(raw_id: "re_request", status: "succeeded", amount_cents: 500)
  end

  def submit(payload = {}, key: "admin-request")
    post "/api/v1/admin/orders/#{order.id}/refund", params: { amount_cents: 500 }.merge(payload),
      headers: key ? { "Idempotency-Key" => key } : {}, as: :json
  end

  it "requires the request header and rejects coercible fractional cents" do
    submit(key: nil)
    expect(response).to have_http_status(:bad_request)
    [ 500.5, "500.5", "500garbage", false, 0 ].each do |value|
      submit({ amount_cents: value })
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(provider).not_to have_received(:refund)
  end

  it "retries the same operation and returns 409 for a different payload" do
    submit
    expect(response).to have_http_status(:ok)
    id = response.parsed_body.dig("refund", "id")
    submit
    expect(response.parsed_body.dig("refund", "id")).to eq(id)
    submit({ amount_cents: 501 })
    expect(response).to have_http_status(:conflict)
    expect(provider).to have_received(:refund).once
  end

  it "persists explicit partial-restock decisions without restoring whole quantities or sending messages" do
    variant = create(:product_variant, stock_quantity: 7)
    create(:order_item, order: order, product: variant.product, product_variant: variant, quantity: 3)
    expect(SendRefundNotificationJob).not_to receive(:perform_later)
    submit({ restock_items: true, metadata: { source: "operator" } })
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("inventory_restored" => false, "inventory_restoration_required" => true,
      "restoration_requested" => { "restock_items" => true })
    expect(variant.reload.stock_quantity).to eq(7)
    expect(RefundOperation.last.metadata).to eq("source" => "operator")
    expect(RefundEffect.count).to eq(2)
  end

  it "returns 202 for pending and unknown outcomes with no notification effect" do
    allow(provider).to receive(:refund).and_return(raw_id: "re_pending", status: "pending", amount_cents: 500)
    submit
    expect(response).to have_http_status(:accepted)
    expect(response.parsed_body["status"]).to eq("pending")
    expect(RefundEffect.count).to eq(0)
  end

  it "does not restore inventory on full refund of an already cancelled order" do
    order.update!(status: "cancelled")
    variant = create(:product_variant, stock_quantity: 9)
    create(:order_item, order: order, product: variant.product, product_variant: variant, quantity: 3)
    allow(provider).to receive(:refund).and_return(raw_id: "re_cancelled", status: "succeeded", amount_cents: 1500)
    submit({ amount_cents: 1500 })
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["inventory_restored"]).to be false
    expect(variant.reload.stock_quantity).to eq(9)
  end
  it 'queries a saved operation by its bound order and keeps a replay from dispatching again' do
    allow(provider).to receive(:refund).and_return(raw_id: 're_status', status: 'pending', amount_cents: 500)
    submit
    operation = RefundOperation.last
    operation.update!(next_recovery_at: 1.second.ago)
    expect(provider).to receive(:query_refund).with(reference: 're_status', operation_key: operation.operation_key, original_reference: operation.original_reference)
      .and_return(raw_id: 're_status', status: 'succeeded', amount_cents: 500)
    post "/api/v1/admin/orders/#{order.id}/refund_operations/#{operation.id}/reconcile"
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body).to include('status' => 'succeeded', 'success' => true)
    expect(provider).to have_received(:refund).once
    foreign = create(:order)
    post "/api/v1/admin/orders/#{foreign.id}/refund_operations/#{operation.id}/reconcile"
    expect(response).to have_http_status(:not_found)
  end

  it 'returns durable no-operation proof for a refused key, allowing a corrected new request only' do
    submit({ amount_cents: 2000 }, key: 'rejected')
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body['no_operation']).to be true
    submit({ amount_cents: 500 }, key: 'rejected')
    expect(response.parsed_body['no_operation']).to be true
    expect(provider).not_to have_received(:refund)
    submit({ amount_cents: 500 }, key: 'corrected')
    expect(response).to have_http_status(:ok)
    expect(provider).to have_received(:refund).once
  end

end
