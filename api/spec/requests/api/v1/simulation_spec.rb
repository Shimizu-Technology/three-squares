require 'rails_helper'
RSpec.describe 'Local simulated payment journeys', type: :request do
  let(:identity) { PaymentIdentity.create!(provider: 'worldpay', environment: 'simulated', external_account_id: 'local_qa', profile_key: SecureRandom.uuid, credential_reference: 'simulation') }
  let(:location) { Location.create!(name: 'Simulated Kitchen', slug: SecureRandom.hex(6), active: true, hours_json: {'Daily'=>'00:00-23:59'}) }
  let(:product) { create(:product, product_type: 'local', allow_pickup: true, allow_shipping: false, inventory_level: 'product', product_stock_quantity: 10) }
  let(:variant) { create(:product_variant, product: product, price_cents: 1250) }
  let(:capability) { SecureRandom.hex(32) }
  let(:cart_key) { SecureRandom.hex(24) }
  let(:headers) { {'X-Checkout-Capability'=>capability, 'Idempotency-Key'=>SecureRandom.uuid, 'X-Session-ID'=>cart_key} }
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('PAYMENTS_SIMULATION_ENABLED').and_return('true')
    SiteSetting.instance.update!(payment_processor: 'worldpay', enable_storefront_three_squares: true)
    %w[online pos].each { |channel| PaymentProfile.create!(payment_identity: identity, provider: 'worldpay', channel: channel, presentation: channel == 'online' ? 'worldpay_hosted_fields' : 'worldpay_terminal', enabled: true) }
    ProductLocation.create!(product: product, location: location)
    CartItem.create!(session_id: cart_key, product_variant: variant, quantity: 1)
  end
  def start_checkout(headers_override: headers)
    post '/api/v1/checkout_sessions', params: {order: {customer_name:'Simulated Guest',email:'guest@example.test',phone:'6715550100',fulfillment_type:'pickup',location_id:location.id}}, headers: headers_override
    expect(response).to have_http_status(:created), response.body
    response.parsed_body
  end
  it 'advances only the owning saved attempt and delivers no other session events' do
    first = start_checkout
    second = start_checkout(headers_override: headers.merge('Idempotency-Key' => SecureRandom.uuid))
    [first, second].each do |state|
      post "/api/v1/checkout_sessions/#{state.fetch('id')}/simulate", params: {
        handle: state.dig('collection_config', 'client_secret'), scenario: 'late_event'
      }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
    identity_time = SimulationClock.for(identity).now
    post "/api/v1/checkout_sessions/#{first.fetch('id')}/advance_simulation", params: {seconds: 61}, headers: headers, as: :json
    expect(response).to have_http_status(:ok), response.body
    expect(Order.find(first.dig('order', 'id')).payment_status).to eq('paid')
    expect(Order.find(second.dig('order', 'id')).payment_status).to eq('pending')
    expect(PaymentAttempt.find(first.fetch('attempt_id')).simulation_offset_seconds).to eq(61)
    expect(PaymentAttempt.find(second.fetch('attempt_id')).simulation_offset_seconds).to eq(0)
    expect(SimulationClock.for(identity).now).to eq(identity_time)
    expect(SimulatedPaymentRecord.find_by!(payment_attempt_id: second.fetch('attempt_id')).facts['event_delivered']).to be_nil
  end
  it 'requires the owning capability and opaque DB handle, then recovers one paid order' do
    state = start_checkout
    path = "/api/v1/checkout_sessions/#{state['id']}/simulate"
    post path, params:{handle:state.dig('collection_config','client_secret'),scenario:'approve'}, headers:headers.merge('X-Checkout-Capability'=>SecureRandom.hex(32))
    expect(response).to have_http_status(:not_found)
    post path, params:{handle:'sim_forged',scenario:'approve'}, headers:headers
    expect(response).to have_http_status(:not_found)
    post path, params:{handle:state.dig('collection_config','client_secret'),scenario:'timeout_after_approval'}, headers:headers
    expect(response).to have_http_status(:unprocessable_entity)
    post "/api/v1/checkout_sessions/#{state['id']}/confirm", headers:headers
    expect(response.parsed_body.dig('order','payment_status')).to eq('paid')
    expect(Order.count).to eq(1)
    expect(product.reload.product_stock_quantity).to eq(9)
    expect(PaymentOutbox.where.not(kind:'cart_cleanup')).to be_empty
  end
  it 'quarantines a reader across two iPads and releases only a resolved outcome' do
    user = create(:user,:admin)
    [Api::V1::Admin::PosOrdersController,Api::V1::Admin::PaymentTerminalsController].each do |controller|
      allow_any_instance_of(controller).to receive(:authenticate_request).and_return(true)
      allow_any_instance_of(controller).to receive(:current_user).and_return(user)
    end
    terminal = PaymentTerminal.create!(payment_identity:identity,location:location,lane_id:'sim-lane',terminal_id:'sim-terminal',label:'Simulation Reader')
    attempts = 2.times.map do
      post '/api/v1/admin/pos/orders', params:{order:{customer_name:'Walk-in',payment_method:'card_present',location_id:location.id,payment_terminal_id:terminal.id,items:[{product_variant_id:variant.id,quantity:1}]}},headers:{'Idempotency-Key'=>SecureRandom.uuid}
      expect(response).to have_http_status(:created), response.body
      response.parsed_body.fetch('payment_attempt_id')
    end
    post "/api/v1/admin/payment_terminals/#{terminal.id}/collect",params:{attempt_id:attempts.first}
    expect(response).to have_http_status(:accepted),response.body
    ProcessTerminalSaleJob.perform_now(attempts.first)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/collect",params:{attempt_id:attempts.last}
    expect(response).to have_http_status(:conflict)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate",params:{command:'approve',attempt_id:attempts.last}
    expect(response).to have_http_status(:conflict)
    expect(Order.where(payment_status:'paid')).to be_empty
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate",params:{command:'disconnect',attempt_id:attempts.first}
    expect(response.parsed_body['status']).to eq('offline')
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate",params:{command:'approve',attempt_id:attempts.first}
    expect(response).to have_http_status(:conflict)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate",params:{command:'reconnect',attempt_id:attempts.first}
    expect(response.parsed_body['status']).to eq('waiting_for_card')
    terminal.update!(leased_at: 1.day.ago)
    expect { terminal.reserve!(PaymentAttempt.find(attempts.last)) }.to raise_error(Payments::Conflict)
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate",params:{command:'lose_response',attempt_id:attempts.first}
    expect(response).to have_http_status(:unprocessable_entity)
    expect(terminal.reload.leased_attempt_id).to eq(attempts.first)
    Payments::ReconcileAttempt.call(attempt:PaymentAttempt.find(attempts.first),force:true)
    expect(PaymentAttempt.find(attempts.first).state).to eq('captured'), PaymentAttempt.find(attempts.first).attributes.slice('state','last_error').inspect
    get "/api/v1/admin/payment_terminals/#{terminal.id}/status"
    expect(response.parsed_body['attempt_id']).to be_nil
    expect(product.reload.product_stock_quantity).to eq(9)
    terminal.update!(leased_attempt_id:attempts.first,status:'offline')
    terminal.with_lock { terminal.release_resolved! }
    expect(terminal.reload.status).to eq('offline')
    expect { terminal.reserve!(PaymentAttempt.find(attempts.last)) }.to raise_error(Payments::Conflict)
    terminal.update!(leased_attempt_id: attempts.first) # reconnect itself must release this resolved lease
    post "/api/v1/admin/payment_terminals/#{terminal.id}/simulate", params: {command:'reconnect',attempt_id:nil}
    expect(response).to have_http_status(:ok)
    expect(terminal.reload.status).to eq('ready')
    expect(terminal.leased_attempt_id).to be_nil
  end
end
