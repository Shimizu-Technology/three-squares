require "rails_helper"

RSpec.describe "Staff route guard inventory", type: :controller do
  # This probe executes the real concern, without invoking unrelated CRUD or
  # payment actions. Request specs separately exercise saved outcomes/ownership.
  let(:probe_class) do
    Class.new(ApplicationController) do
      include Authenticatable
      attr_accessor :route_controller, :route_action, :actor
      def controller_path = route_controller
      def action_name = route_action
      def current_user = actor
    end
  end
  let!(:location) { create(:location) }
  let!(:order) { create(:order, location: location) }
  let!(:product) { create(:product, product_stock_quantity: 0) }
  let!(:variant) { create(:product_variant, product: product, stock_quantity: 0) }
  let!(:terminal) do
    identity = PaymentIdentity.create!(provider: "worldpay", environment: "simulated",
      external_account_id: "guard-spec", profile_key: SecureRandom.uuid, credential_reference: "simulation")
    PaymentTerminal.create!(payment_identity: identity, location: location, label: "Guard reader",
      lane_id: SecureRandom.uuid, terminal_id: SecureRandom.uuid)
  end

  def guard(path, action, actor)
    probe = probe_class.new
    probe.set_request!(ActionController::TestRequest.create(probe_class))
    probe.set_response!(ActionDispatch::TestResponse.new)
    probe.route_controller, probe.route_action, probe.actor = path, action, actor
    id = case path
    when "api/v1/admin/payment_terminals" then terminal.id
    when "api/v1/admin/pos_orders" then order.id
    when "api/v1/admin/product_variants" then variant.id
    else product.id
    end
    probe.params = { id: id, order: { location_id: location.id } }
    [ probe.send(:authorize_staff_route!), probe.response ]
  end

  it "maps every actual Rails admin controller/action and inherits the shared before callback" do
    routes = Rails.application.routes.routes.filter_map do |route|
      path, action = route.defaults.values_at(:controller, :action)
      [ path, action ] if path&.start_with?("api/v1/admin/")
    end.uniq
    expect(routes.size).to be > 90
    routes.each do |path, action|
      aggregate_failures("#{path}##{action}") do
        capability = StaffRouteCapabilities::ADMIN.dig(path, action)
        expect(capability).to be_present
        expect(StaffAccessPolicy::CAPABILITIES).to include(capability)
        klass = "#{path.camelize}Controller".constantize
        expect(klass._process_action_callbacks.select { |callback| callback.kind == :before }.map(&:filter))
          .to include(:authorize_staff_route!)
        expect(klass.ancestors).to include(StaffAuthorization)
      end
    end
  end

  it "runs the real guard for every mapped admin action across all seven role/assignment cases" do
    staff = %w[orders.read orders.counts orders.status pos.sell payments.collect availability.manage devices.self]
    manager = staff + %w[orders.manage orders.notify orders.export payments.refund analytics.read devices.manage
      locations.read locations.update locations.qr catalog.manage catalog.import stock.read seasonal.manage catering.manage]
    global_manager = manager + %w[stock.manage homepage.manage payments.terminals.manage payments.reconcile]
    actors = {
      owner: [ create(:user, :owner, assigned_location: location), :all ],
      global_manager: [ create(:user, :manager), global_manager ],
      scoped_manager: [ create(:user, :manager, assigned_location: location), manager ],
      assigned_staff: [ create(:user, :staff, assigned_location: location), staff ],
      unassigned_staff: [ build(:user, role: "staff", assigned_location: nil), [] ],
      customer: [ create(:user), [] ], anonymous: [ nil, [] ]
    }
    StaffRouteCapabilities::ADMIN.each do |path, actions|
      actions.each do |action, capability|
        actors.each do |name, (actor, allowed)|
          expected = allowed == :all || allowed.include?(capability)
          # The legacy importer also writes shared inventory, unlike menu CSV.
          expected = false if name == :scoped_manager && path == "api/v1/admin/imports" && action == "create"
          admitted, response = guard(path, action, actor)
          expect(admitted).to eq(expected), "#{path}##{action} / #{name}: #{response.body}"
          expect(response.status).to eq(name == :anonymous ? 401 : 403) unless expected
        end
      end
    end
  end

  it "denies unknown admin actions even for owners instead of using the pure-policy fallback" do
    admitted, response = guard("api/v1/admin/users", "unclassified", create(:user, :owner))
    expect(admitted).to be(false)
    expect(response.status).to eq(403)
    expect(JSON.parse(response.body)["error"]).to include("no access policy")
  end

  it "keeps the legacy order list/update explicitly classified without treating public routes as admin" do
    expect(StaffRouteCapabilities.capability_for("api/v1/orders", "index")).to eq("orders.read")
    expect(StaffRouteCapabilities.capability_for("api/v1/orders", "update")).to eq("orders.manage")
    expect(StaffRouteCapabilities.protected?("api/v1/orders", "show")).to be(false)
    expect(StaffRouteCapabilities.protected?("api/v1/checkout_sessions", "simulate")).to be(false)
  end

  describe Api::V1::Admin::BaseController do
    controller(Api::V1::Admin::BaseController) do
      def controller_path = "api/v1/admin/unmapped_guard_fixture"
      def unclassified = head(:no_content)
    end

    it "returns 403 for a routed unclassified admin action even after authenticating an owner" do
      user = create(:user, :owner)
      client = double("Clerk", users: double("Clerk users", find: {
        "primary_email_address_id" => "email", "email_addresses" => [ { "id" => "email", "email_address" => user.email } ]
      }), verify_token: { "sub" => user.clerk_id })
      allow(Clerk::SDK).to receive(:new).and_return(client)
      path = controller.class.controller_path
      routes.draw { get "unclassified", to: "#{path}#unclassified" }
      request.headers["Authorization"] = "Bearer owner-test-token"
      get :unclassified
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body.fetch("error")).to include("no access policy")
      expect(controller.send(:current_user).id).to eq(user.id)
    end
  end
end
