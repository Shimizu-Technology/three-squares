require "rails_helper"

RSpec.describe "Staff authorization attack boundaries", type: :request do
  let!(:main) { create(:location, name: "Main", hours_json: { "Daily" => "00:00-23:59" }, admin_email: "private@example.test") }
  let!(:other) { create(:location, name: "Other", hours_json: { "Daily" => "00:00-23:59" }) }
  let(:staff) { create(:user, :staff, assigned_location: main) }
  let(:manager) { create(:user, :manager, assigned_location: main) }
  let(:owner) { create(:user, :owner, assigned_location: main) }
  let(:headers) { { "Authorization" => "Bearer regression-token", "X-Admin-Location-Id" => other.id.to_s } }
  let(:product) { create(:product, product_type: "local", allow_pickup: true, allow_shipping: false,
    inventory_level: "product", track_inventory: true, product_stock_quantity: 12) }
  let(:variant) { create(:product_variant, product: product, price_cents: 2500, stock_quantity: 8) }

  before do
    # Only the Clerk boundary is mocked. Authentication, bootstrap, callbacks,
    # capabilities and record scopes execute normally on every request.
    @actor = staff
    users = double("Clerk users")
    client = double("Clerk client", users: users)
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token) { { "sub" => @actor.clerk_id } }
    allow(users).to receive(:find) do |id|
      raise "Unexpected Clerk subject" unless id == @actor.clerk_id
      { "primary_email_address_id" => "email", "email_addresses" => [ { "id" => "email", "email_address" => @actor.email } ] }
    end
    # A regression must fail locally, never reach a payment/message provider.
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise "External HTTP forbidden in authorization regressions" }
    @previous_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
  end

  after { ActiveJob::Base.queue_adapter = @previous_adapter }

  def request_as(method, path, params: {}, extra_headers: {})
    options = { params: params, headers: headers.merge(extra_headers) }
    options[:as] = :json unless method == :get
    public_send(method, path, **options)
  end

  def unchanged_operations
    models = [ Order, OrderItem, Product, ProductVariant, ProductLocation, InventoryAudit,
      CheckoutSession, PaymentAttempt, PaymentTransaction, PaymentTerminal, PaymentOutbox,
      RefundOperation, Refund, AdminDevice, AdminPushSubscription, Import ]
    snapshot = -> { models.map { |model| model.order(:id).map(&:attributes) } + [ ActiveJob::Base.queue_adapter.enqueued_jobs.dup ] }
    expect { yield }.not_to change(&snapshot)
  end

  def pickup(location, **attrs)
    create(:order, location: location, fulfillment_type: "pickup", payment_status: "paid", simulated: true, **attrs)
  end

  describe "order scope and restricted fields" do
    let!(:mine) { pickup(main) }
    let!(:theirs) { pickup(other) }
    let!(:locationless) { create(:order, fulfillment_type: "shipping", payment_status: "paid", simulated: true) }

    it "intersects forged location queries, keeps an allowed filter usable, and exposes counts without revenue" do
      %w[/api/v1/admin/orders /api/v1/orders].each do |path|
        request_as(:get, path, params: { location_id: other.id })
        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.fetch("orders")).to eq([])
        request_as(:get, path, params: { location_id: main.id })
        expect(response.parsed_body.fetch("orders").pluck("id")).to eq([ mine.id ])
        request_as(:get, path)
        expect(response.parsed_body.fetch("orders").pluck("id")).to eq([ mine.id ])
      end
      request_as(:get, "/api/v1/admin/orders/summary", params: { location_id: other.id })
      expect(response.parsed_body.fetch("total_orders")).to eq(0)
      request_as(:get, "/api/v1/admin/orders/summary", params: { location_id: main.id })
      expect(response.parsed_body).to include("total_orders" => 1, "paid_orders" => 1, "status_counts" => { "pending" => 1 })
      expect(response.parsed_body).not_to have_key("total_revenue_cents")
      expect(response.parsed_body.fetch("queue_stage_counts")).to be_a(Hash)
    end

    %w[manager staff].each do |role|
      it "hides guessed admin/legacy details and rejects out-of-scope writes for #{role}, with no effects" do
        @actor = role == "manager" ? manager : staff
        unchanged_operations do
          %W[/api/v1/admin/orders/#{theirs.id} /api/v1/orders/#{theirs.id} /api/v1/admin/orders/#{locationless.id}].each do |path|
            request_as(:get, path, params: { location_id: main.id })
            expect(response).to have_http_status(:not_found)
          end
          request_as(:patch, "/api/v1/admin/orders/#{theirs.id}", params: { location_id: main.id,
            order: { status: "confirmed", location_id: main.id } })
          expect(response).to have_http_status(:not_found)
          request_as(:patch, "/api/v1/orders/#{theirs.id}", params: { order: { status: "confirmed", location_id: main.id } })
          expect(response).to have_http_status(role == "manager" ? :not_found : :forbidden)
          %w[refund notify].each do |action|
            request_as(:post, "/api/v1/admin/orders/#{theirs.id}/#{action}", params: { location_id: main.id, amount_cents: 1 })
            expect(response).to have_http_status(role == "manager" ? :not_found : :forbidden)
          end
        end
      end
    end

    it "allows an assigned staff status transition but rejects notes, refunds, revenue, export and legacy update" do
      request_as(:get, "/api/v1/admin/orders/#{mine.id}")
      expect(response).to have_http_status(:ok)
      request_as(:patch, "/api/v1/admin/orders/#{mine.id}", params: { order: { status: "confirmed" } })
      expect(response).to have_http_status(:ok)
      expect(mine.reload.status).to eq("confirmed")
      unchanged_operations do
        request_as(:patch, "/api/v1/admin/orders/#{mine.id}", params: { order: { status: "ready", admin_notes: "forged" } })
        expect(response).to have_http_status(:forbidden)
        request_as(:patch, "/api/v1/orders/#{mine.id}", params: { order: { status: "ready" } })
        expect(response).to have_http_status(:forbidden)
        [ [ :get, "/api/v1/admin/orders/export" ], [ :get, "/api/v1/admin/dashboard/stats" ],
          [ :post, "/api/v1/admin/orders/#{mine.id}/refund" ], [ :post, "/api/v1/admin/orders/#{mine.id}/notify" ] ].each do |method, path|
          request_as(method, path, params: { location_id: main.id })
          expect(response).to have_http_status(:forbidden)
        end
      end
    end

    it "limits manager CSV output and summary to the authorized intersection" do
      @actor = manager
      # Reporting deliberately excludes simulations. These are isolated rows,
      # tagged as production evidence without creating any provider payment.
      [ mine, theirs, locationless ].each { |order| order.update_columns(simulated: false, payment_environment: "production") }
      request_as(:get, "/api/v1/admin/orders/export", params: { location_id: other.id })
      expect(response).to have_http_status(:ok)
      expect(CSV.parse(response.body, headers: true).size).to eq(0)
      request_as(:get, "/api/v1/admin/orders/export", params: { location_id: main.id })
      expect(CSV.parse(response.body, headers: true).size).to eq(1)
      expect(response.body).to include(mine.order_number)
      expect(response.body).not_to include(theirs.order_number, locationless.order_number)
      request_as(:get, "/api/v1/admin/orders/summary", params: { location_id: other.id })
      expect(response.parsed_body).to include("total_orders" => 0, "total_revenue_cents" => 0)
    end

    it "keeps a customer on their own order even with a staff location/device header" do
      @actor = create(:user)
      mine.update!(user: @actor)
      request_as(:get, "/api/v1/orders/#{mine.id}")
      expect(response).to have_http_status(:ok)
      request_as(:get, "/api/v1/orders/#{theirs.id}")
      expect(response).to have_http_status(:not_found)
      request_as(:get, "/api/v1/admin/orders", extra_headers: { "X-Admin-Device-Id" => "guessed" })
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "role writes and scope disclosure" do
    %w[manager staff].each do |role|
      it "rejects #{role} self-promotion and reassignment before writing anything" do
        @actor = role == "manager" ? manager : staff
        original = @actor.attributes
        request_as(:patch, "/api/v1/admin/users/#{@actor.id}", params: { user: { role: "owner", assigned_location_id: other.id } })
        expect(response).to have_http_status(:forbidden)
        expect(@actor.reload.attributes).to eq(original)
      end
    end

    it "fails a staff account with a removed assignment closed with actionable recovery copy" do
      staff.update_column(:assigned_location_id, nil)
      unchanged_operations do
        %w[/api/v1/admin/orders /api/v1/admin/pos/menu /api/v1/admin/devices/current].each do |path|
          request_as(:get, path, params: { location_id: other.id }, extra_headers: { "X-Admin-Device-Id" => "forged" })
          expect(response).to have_http_status(:forbidden)
          expect(response.parsed_body).to include("code" => "staff_access_denied", "error" => "Ask a manager to assign your location")
        end
      end
    end

    it "discloses all safe location choices to an assigned owner and only one to staff" do
      @actor = owner
      request_as(:get, "/api/v1/me")
      expect(response.parsed_body).to include("operational_scope" => "all", "location_scoped" => false)
      expect(response.parsed_body.fetch("authorized_locations").pluck("id")).to match_array([ main.id, other.id ])
      response.parsed_body.fetch("authorized_locations").each { |row| expect(row.keys).to match_array(%w[id name slug]) }
      expect(response.parsed_body.fetch("capabilities")).to include("users.manage", "payments.simulate")
      @actor = staff
      request_as(:get, "/api/v1/me")
      expect(response.parsed_body.fetch("authorized_locations").pluck("id")).to eq([ main.id ])
      expect(response.parsed_body.fetch("capabilities")).not_to include("users.manage", "analytics.read")
    end

    it "returns 422 when the last owner attempts request-level demotion" do
      @actor = owner
      request_as(:patch, "/api/v1/admin/users/#{owner.id}", params: { user: { role: "customer" } })
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.fetch("error")).to include("last owner")
      expect(owner.reload.role).to eq("owner")
    end

    it "preserves an explicit allowlisted customer demotion through actual Clerk verification and bootstrap" do
      @actor = create(:user, email: Authenticatable::ADMIN_EMAILS.first, role: "customer")
      request_as(:get, "/api/v1/me")
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include("role" => "customer", "operational_scope" => "none", "authorized_locations" => [])
      expect(@actor.reload.role).to eq("customer")
      request_as(:get, "/api/v1/admin/users")
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "local availability and shared stock" do
    before do
      variant
      SiteSetting.instance.update!(enable_storefront_three_squares: true)
    end

    it "materializes the first local 86 without changing other locations, prices, publication or stock, and blocks a sold-out POS sale" do
      original_product = product.attributes
      original_variant = variant.attributes
      expect(product.available_for_location?(main.id)).to be(true)
      expect(product.available_for_location?(other.id)).to be(true)
      request_as(:patch, "/api/v1/admin/products/#{product.id}/availability", params: { availability: { location_id: main.id, available: false } })
      expect(response).to have_http_status(:ok)
      expect(product.reload.available_for_location?(main.id)).to be(false)
      expect(product.available_for_location?(other.id)).to be(true)
      expect(product.product_locations.pluck(:location_id, :available)).to match_array([ [ main.id, false ], [ other.id, true ] ])
      expect(product.attributes).to eq(original_product)
      expect(variant.reload.attributes).to eq(original_variant)
      expect { request_as(:post, "/api/v1/admin/pos/orders", params: { order: { location_id: main.id,
        payment_method: "cash", items: [ { product_variant_id: variant.id, quantity: 1 } ] } },
        extra_headers: { "Idempotency-Key" => SecureRandom.uuid }) }.not_to change(Order, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.fetch("error")).to include("not available at this location")
      expect(product.reload.product_stock_quantity).to eq(12)
      expect(PaymentAttempt.count).to eq(0)
      request_as(:patch, "/api/v1/admin/products/#{product.id}/availability", params: { availability: { location_id: main.id, available: true } })
      expect(response).to have_http_status(:ok)
      expect(product.reload.available_for_location?(main.id)).to be(true)
    end

    it "rejects foreign locations, non-boolean availability and smuggled catalog/stock fields without saving" do
      unchanged_operations do
        request_as(:patch, "/api/v1/admin/products/#{product.id}/availability", params: { availability: { location_id: other.id, available: false } })
        expect(response).to have_http_status(:not_found)
        [ "false", "true", 0, 1, nil ].each do |value|
          request_as(:patch, "/api/v1/admin/products/#{product.id}/availability", params: { availability: { location_id: main.id, available: value } })
          expect(response).to have_http_status(:unprocessable_entity)
        end
        { base_price_cents: 1, price_override_cents: 1, published: false, product_stock_quantity: 999 }.each do |field, value|
          request_as(:patch, "/api/v1/admin/products/#{product.id}/availability", params: { availability: { location_id: main.id, available: false, field => value } })
          expect(response).to have_http_status(:unprocessable_entity)
        end
        request_as(:patch, "/api/v1/admin/products/#{product.id}", params: { product: { base_price_cents: 1 } })
        expect(response).to have_http_status(:forbidden)
      end
    end

    it "allows scoped manager catalog description edits but blocks embedded product/variant stock and legacy inventory import" do
      @actor = manager
      [ main, other ].each { |location| ProductLocation.create!(product: product, location: location, available: true) }
      request_as(:patch, "/api/v1/admin/products/#{product.id}", params: { product: { description: "Kitchen instructions" } })
      expect(response).to have_http_status(:ok)
      expect(product.reload.description).to eq("Kitchen instructions")
      unchanged_operations do
        [ { product_stock_quantity: 99 }, { track_inventory: false }, { inventory_level: "variant" }, { product_low_stock_threshold: 99 } ].each do |attrs|
          request_as(:patch, "/api/v1/admin/products/#{product.id}", params: { product: attrs })
          expect(response).to have_http_status(:forbidden)
        end
        request_as(:patch, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}", params: { product_variant: { stock_quantity: 999 } })
        expect(response).to have_http_status(:forbidden)
        request_as(:patch, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}", params: { product_variant: {}, variant: { stock_quantity: 999 } })
        expect(response).to have_http_status(:forbidden)
        request_as(:post, "/api/v1/admin/products/#{product.id}/variants/generate", params: { product_variant: {}, sizes: [ "Unique size" ], stock_quantity: 999 })
        expect(response).to have_http_status(:forbidden)
        request_as(:post, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}/adjust_stock", params: { adjustment: 1 })
        expect(response).to have_http_status(:forbidden)
        request_as(:delete, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}")
        expect(response).to have_http_status(:forbidden)
        request_as(:post, "/api/v1/admin/imports", params: { import: { import_type: "products" }, inventory_file: "guessed.csv" })
        expect(response).to have_http_status(:forbidden)
      end
      @actor = create(:user, :manager)
      request_as(:patch, "/api/v1/admin/products/#{product.id}", params: { product: { product_stock_quantity: 99 } })
      expect(response).to have_http_status(:ok)
      expect(product.reload.product_stock_quantity).to eq(99)
    end

    it "does not overwrite stock changed between catalog authorization and the handler" do
      @actor = manager
      ProductLocation.create!(product: product, location: main, available: true)
      variant
      allow_any_instance_of(Api::V1::Admin::ProductsController).to receive(:authorize_shared_stock_write!).and_wrap_original do |original|
        permitted = original.call
        product.update_columns(product_stock_quantity: 11)
        permitted
      end
      request_as(:patch, "/api/v1/admin/products/#{product.id}", params: { product: { description: "Catalog edit", product_stock_quantity: 12 } })
      expect(response).to have_http_status(:ok)
      expect(product.reload.product_stock_quantity).to eq(11)
      expect(product.description).to eq("Catalog edit")

      allow_any_instance_of(Api::V1::Admin::ProductVariantsController).to receive(:authorize_shared_stock_write!).and_wrap_original do |original|
        permitted = original.call
        variant.update_columns(stock_quantity: 7)
        permitted
      end
      request_as(:patch, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}", params: { variant: { variant_name: "Catalog variant", stock_quantity: 8 } })
      expect(response).to have_http_status(:ok)
      expect(variant.reload.stock_quantity).to eq(7)
      expect(variant.variant_name).to eq("Catalog variant")
    end

    it "creates catalog variants with server-owned zero stock whether omitted or explicitly zero" do
      @actor = manager
      tracked = create(:product, inventory_level: "variant", track_inventory: true)
      [ {}, { stock_quantity: 0 } ].each_with_index do |stock, index|
        request_as(:post, "/api/v1/admin/products/#{tracked.id}/variants", params: { variant: {
          variant_key: "new-size-#{index}", variant_name: "New size #{index}", price_cents: 2500, weight_oz: 8
        }.merge(stock) })
        expect(response).to have_http_status(:created)
        created = tracked.product_variants.find(response.parsed_body.fetch("data").fetch("id"))
        expect(created.stock_quantity).to eq(0)
      end
    end

    it "retains the authorized variant alias when stripping its unchanged stock empties it" do
      @actor = manager
      variant
      unchanged_operations do
        request_as(:patch, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}", params: { product_variant: { stock_quantity: 8 }, variant: { stock_quantity: 999 } })
        expect(response).to have_http_status(:ok)
      end
      expect(variant.reload.stock_quantity).to eq(8)
    end

    it "rechecks a restocked variant under lock before a scoped manager deletes it" do
      @actor = manager
      variant.update!(stock_quantity: 0)
      allow_any_instance_of(Api::V1::Admin::ProductVariantsController).to receive(:authorize_shared_stock_write!).and_wrap_original do |original|
        permitted = original.call
        variant.update_columns(stock_quantity: 4)
        permitted
      end
      request_as(:delete, "/api/v1/admin/products/#{product.id}/variants/#{variant.id}")
      expect(response).to have_http_status(:forbidden)
      expect(variant.reload.stock_quantity).to eq(4)
    end

    it "never copies newly restocked inventory into a scoped manager's catalog duplicate" do
      @actor = manager
      product.update!(product_stock_quantity: 0)
      variant.update!(stock_quantity: 0)
      allow_any_instance_of(Api::V1::Admin::ProductsController).to receive(:authorize_shared_stock_write!).and_wrap_original do |original|
        permitted = original.call
        product.update_columns(product_stock_quantity: 4)
        variant.update_columns(stock_quantity: 4)
        permitted
      end
      request_as(:post, "/api/v1/admin/products/#{product.id}/duplicate")
      expect(response).to have_http_status(:created)
      copy = Product.find(response.parsed_body.fetch("data").fetch("id"))
      expect(copy.product_stock_quantity).to eq(0)
      expect(copy.product_variants.pluck(:stock_quantity)).to all(eq(0))
      expect(product.reload.product_stock_quantity).to eq(4)
      expect(variant.reload.stock_quantity).to eq(4)
    end

    it "hides stock audits linked to another location's orders while retaining global stock read" do
      @actor = manager
      mine = pickup(main)
      theirs = pickup(other)
      rows = [ nil, mine, theirs ].map do |order|
        InventoryAudit.create!(product: product, order: order, audit_type: "manual_adjustment",
          quantity_change: 1, previous_quantity: 11, new_quantity: 12, metadata: { secret: "order-specific" })
      end
      request_as(:get, "/api/v1/admin/inventory_audits")
      expect(response.parsed_body.fetch("audits").pluck("id")).to match_array(rows.first(2).map(&:id))
      request_as(:get, "/api/v1/admin/inventory_audits/#{rows.last.id}")
      expect(response).to have_http_status(:not_found)
      request_as(:get, "/api/v1/admin/orders/#{theirs.id}/inventory_audits")
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "location management" do
    it "allows only hours/active/QR in a manager's assignment; creation, deletion and notification contacts stay owner-only" do
      @actor = manager
      request_as(:patch, "/api/v1/admin/locations/#{main.id}", params: { location: { active: false, hours_json: { "Daily" => "08:00-17:00" } } })
      expect(response).to have_http_status(:ok)
      expect(main.reload).not_to be_active
      request_as(:post, "/api/v1/admin/locations/#{main.id}/generate_qr")
      expect(response).to have_http_status(:ok)
      expect(main.reload.qr_code_url).to be_present
      original = Location.order(:id).map(&:attributes)
      [ [ :patch, "/api/v1/admin/locations/#{other.id}", { location: { active: false } }, :not_found ],
        [ :patch, "/api/v1/admin/locations/#{main.id}", { location: { admin_email: "forged@example.test" } }, :forbidden ],
        [ :post, "/api/v1/admin/locations", { location: { name: "Forged", slug: "forged" } }, :forbidden ],
        [ :delete, "/api/v1/admin/locations/#{main.id}", {}, :forbidden ] ].each do |method, path, params, status|
        request_as(method, path, params: params)
        expect(response).to have_http_status(status)
      end
      expect(Location.order(:id).map(&:attributes)).to eq(original)
    end
  end

  describe "POS and terminal scope before payment work" do
    let!(:identity) { PaymentIdentity.create!(provider: "worldpay", environment: "simulated",
      external_account_id: "rbac-spec", profile_key: SecureRandom.uuid, credential_reference: "simulation") }
    let!(:reader) { PaymentTerminal.create!(payment_identity: identity, location: main, label: "Main reader", lane_id: SecureRandom.uuid, terminal_id: SecureRandom.uuid) }
    let!(:foreign_reader) { PaymentTerminal.create!(payment_identity: identity, location: other, label: "Other reader", lane_id: SecureRandom.uuid, terminal_id: SecureRandom.uuid) }

    around do |example|
      previous = ENV["PAYMENTS_SIMULATION_ENABLED"]
      ENV["PAYMENTS_SIMULATION_ENABLED"] = "true"
      example.run
    ensure
      previous.nil? ? ENV.delete("PAYMENTS_SIMULATION_ENABLED") : ENV["PAYMENTS_SIMULATION_ENABLED"] = previous
    end

    it "completes staff cash POS at the assignment without trusting a location header" do
      SiteSetting.instance.update!(enable_storefront_three_squares: true)
      request_as(:post, "/api/v1/admin/pos/orders", params: { order: { payment_method: "cash",
        items: [ { product_variant_id: variant.id, quantity: 1 } ] } }, extra_headers: { "Idempotency-Key" => SecureRandom.uuid })
      expect(response).to have_http_status(:created), response.body
      sale = Order.find(response.parsed_body.fetch("id"))
      expect(sale).to have_attributes(location_id: main.id, created_by_user_id: staff.id, payment_status: "paid", source: "pos")
      expect(product.reload.product_stock_quantity).to eq(11)
    end

    it "allows staff card creation/collect/status/confirm but preserves a different attempt's terminal lease" do
      SiteSetting.instance.update!(payment_processor: "worldpay", enable_storefront_three_squares: true)
      PaymentProfile.create!(payment_identity: identity, provider: "worldpay", channel: "pos", presentation: "worldpay_terminal", enabled: true)
      states = 2.times.map do
        request_as(:post, "/api/v1/admin/pos/orders", params: { order: { payment_method: "card_present", location_id: main.id,
          items: [ { product_variant_id: variant.id, quantity: 1 } ] } }, extra_headers: { "Idempotency-Key" => SecureRandom.uuid })
        expect(response).to have_http_status(:created), response.body
        response.parsed_body
      end
      first_attempt, second_attempt = states.map { |state| state.fetch("payment_attempt_id") }
      request_as(:get, "/api/v1/admin/payment_terminals/#{reader.id}/status")
      expect(response).to have_http_status(:ok)
      request_as(:post, "/api/v1/admin/payment_terminals/#{reader.id}/collect", params: { attempt_id: first_attempt })
      expect(response).to have_http_status(:accepted)
      expect(reader.reload.leased_attempt_id).to eq(first_attempt)
      unchanged_operations do
        request_as(:post, "/api/v1/admin/payment_terminals/#{reader.id}/collect", params: { attempt_id: second_attempt })
        expect(response).to have_http_status(:conflict)
      end
      request_as(:post, "/api/v1/admin/pos/orders/#{states.first.fetch('id')}/confirm_terminal_payment")
      expect(response).to have_http_status(:accepted), response.body
      expect(reader.reload.leased_attempt_id).to eq(first_attempt)
      expect(Order.where(payment_status: "paid")).to be_empty
      expect(product.reload.product_stock_quantity).to eq(12)
    end

    it "rejects forged POS body location and guessed confirm/status/collect records with no DB, job or provider effects" do
      variant
      foreign_order = pickup(other, source: "pos", staff_created: true)
      unchanged_operations do
        request_as(:post, "/api/v1/admin/pos/orders", params: { location_id: main.id, order: { location_id: other.id,
          items: [ { product_variant_id: variant.id, quantity: 1 } ] } }, extra_headers: { "Idempotency-Key" => SecureRandom.uuid })
        expect(response).to have_http_status(:not_found)
        request_as(:post, "/api/v1/admin/pos/orders/#{foreign_order.id}/confirm_terminal_payment", params: { location_id: main.id })
        expect(response).to have_http_status(:not_found)
        request_as(:get, "/api/v1/admin/payment_terminals/#{foreign_reader.id}/status", params: { location_id: main.id })
        expect(response).to have_http_status(:not_found)
        request_as(:post, "/api/v1/admin/payment_terminals/#{foreign_reader.id}/collect", params: { location_id: main.id, attempt_id: SecureRandom.uuid })
        expect(response).to have_http_status(:not_found)
      end
      request_as(:get, "/api/v1/admin/payment_terminals", params: { location_id: other.id })
      expect(response.parsed_body.fetch("terminals").pluck("id")).to eq([ reader.id ])
    end

    it "preserves the checkout-user check for an in-scope terminal collect before reserving its lease" do
      order = pickup(main, source: "pos", staff_created: true)
      customer = create(:user)
      session = CheckoutSession.create!(order: order, user: customer, location: main, payment_identity: identity,
        owner_key: "user:#{customer.id}", guest_capability_digest: "", caller_idempotency_key: SecureRandom.uuid, snapshot: {}, snapshot_digest: "digest",
        amount_cents: order.total_cents, currency: "USD", expires_at: 30.minutes.from_now, channel: "pos")
      attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity,
        payload_digest: session.snapshot_digest, requested_cents: session.amount_cents, currency: "USD",
        operation: "sale", operation_key: SecureRandom.uuid, state: "collecting")
      unchanged_operations do
        request_as(:post, "/api/v1/admin/payment_terminals/#{reader.id}/collect", params: { attempt_id: attempt.id })
        expect(response).to have_http_status(:not_found)
      end
      expect(reader.reload.leased_attempt_id).to be_nil
    end

    it "rejects staff/scoped managers provisioning and simulation, and global managers simulation/discovery" do
      unchanged_operations do
        [ staff, manager, create(:user, :manager) ].each do |actor|
          @actor = actor
          request_as(:post, "/api/v1/admin/payment_terminals/#{reader.id}/simulate", params: { command: "reconnect" })
          expect(response).to have_http_status(:forbidden)
          request_as(:get, "/api/v1/admin/stripe_terminal/readers")
          expect(response).to have_http_status(:forbidden)
          request_as(:post, "/api/v1/admin/stripe_terminal/connection_token")
          expect(response).to have_http_status(:forbidden)
          next if actor.manager? && actor.assigned_location_id.nil?
          request_as(:post, "/api/v1/admin/payment_terminals", params: { payment_identity_id: identity.id,
            location_id: main.id, label: "Forged reader", lane_id: "forged", terminal_id: "forged" })
          expect(response).to have_http_status(:forbidden)
        end
      end
    end
  end

  describe "device identities" do
    it "cannot steal or deactivate another same-location user's UUID by GET, PUT, push or unsubscribe" do
      victim = create(:admin_device, user: manager, location: main)
      subscription = create(:admin_push_subscription, admin_device: victim)
      unchanged_operations do
        identity_header = { "X-Admin-Device-Id" => victim.device_uuid }
        [ [ :get, "/api/v1/admin/devices/current", {} ],
          [ :put, "/api/v1/admin/devices/current", { device: { name: "Stolen", location_id: main.id } } ],
          [ :post, "/api/v1/admin/devices/current/push_subscription", { subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key } } } ],
          [ :delete, "/api/v1/admin/devices/current/push_subscription", { endpoint: subscription.endpoint } ] ].each do |method, path, params|
          request_as(method, path, params: params, extra_headers: identity_header)
          expect(response).to have_http_status(:not_found)
        end
        request_as(:patch, "/api/v1/admin/devices/#{victim.id}", params: { device: { active: false } })
        expect(response).to have_http_status(:forbidden)
      end
      expect(subscription.reload).to be_active
      expect(victim.reload.user_id).to eq(manager.id)
    end

    it "lets staff register/read their own device but rejects relocation; manager manages others only in scope" do
      own_header = { "X-Admin-Device-Id" => SecureRandom.uuid }
      request_as(:put, "/api/v1/admin/devices/current", params: { device: { name: "My counter", location_id: main.id } }, extra_headers: own_header)
      expect(response).to have_http_status(:ok)
      own = AdminDevice.find_by!(device_uuid: own_header.fetch("X-Admin-Device-Id"))
      expect(own.user_id).to eq(staff.id)
      request_as(:get, "/api/v1/admin/devices/current", extra_headers: own_header)
      expect(response.parsed_body.dig("device", "id")).to eq(own.id)
      request_as(:put, "/api/v1/admin/devices/current", params: { device: { location_id: other.id } }, extra_headers: own_header)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(own.reload.location_id).to eq(main.id)
      foreign = create(:admin_device, location: other)
      @actor = manager
      request_as(:patch, "/api/v1/admin/devices/#{own.id}", params: { device: { active: false } })
      expect(response).to have_http_status(:ok)
      expect(own.reload).not_to be_active
      unchanged_operations do
        request_as(:patch, "/api/v1/admin/devices/#{foreign.id}", params: { device: { active: false, location_id: main.id } })
        expect(response).to have_http_status(:not_found)
      end
      request_as(:get, "/api/v1/admin/devices")
      expect(response.parsed_body.fetch("devices").pluck("id")).to eq([ own.id ])
    end
  end
end
