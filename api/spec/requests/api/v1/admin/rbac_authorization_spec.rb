# frozen_string_literal: true

require "rails_helper"

RSpec.describe "RBAC Authorization", type: :request do
  let(:location) { create(:location) }
  let(:owner_user) { create(:user, :owner) }
  let(:manager_user) { create(:user, :manager) }
  let(:staff_user) { create(:user, :staff, assigned_location: location) }
  let(:customer_user) { create(:user, role: "customer") }

  # Stub Clerk auth globally, set current_user per-test
  def stub_auth_as(user)
    allow_any_instance_of(Authenticatable).to receive(:authenticate_request) do |controller|
      controller.instance_variable_set(:@current_user, user)
    end
  end

  # ---- Owner-only endpoints ----
  describe "owner-only endpoints" do
    let(:owner_only_gets) do
      %w[
        /api/v1/admin/site_settings
        /api/v1/admin/settings
        /api/v1/admin/products
        /api/v1/admin/collections
        /api/v1/admin/users
        /api/v1/admin/locations
        /api/v1/admin/imports
        /api/v1/admin/variant_presets
      ]
    end

    it "allows owner access" do
      stub_auth_as(owner_user)
      owner_only_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).not_to eq(403), "Expected #{path} accessible by owner, got #{response.status}"
      end
    end

    it "denies manager access" do
      stub_auth_as(manager_user)
      owner_only_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).to eq(403), "Expected #{path} forbidden for manager, got #{response.status}"
      end
    end

    it "denies staff access" do
      stub_auth_as(staff_user)
      owner_only_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).to eq(403), "Expected #{path} forbidden for staff, got #{response.status}"
      end
    end

    it "denies customer access" do
      stub_auth_as(customer_user)
      owner_only_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).to eq(403), "Expected #{path} forbidden for customer, got #{response.status}"
      end
    end
  end

  # ---- Manager-or-above endpoints ----
  describe "manager-or-above endpoints" do
    let(:manager_gets) do
      %w[
        /api/v1/admin/dashboard/stats
        /api/v1/admin/inventory_audits
      ]
    end

    it "allows owner access" do
      stub_auth_as(owner_user)
      manager_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).not_to eq(403), "Expected #{path} accessible by owner"
      end
    end

    it "allows manager access" do
      stub_auth_as(manager_user)
      manager_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).not_to eq(403), "Expected #{path} accessible by manager"
      end
    end

    it "denies staff access" do
      stub_auth_as(staff_user)
      manager_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).to eq(403), "Expected #{path} forbidden for staff, got #{response.status}"
      end
    end

    it "denies customer access" do
      stub_auth_as(customer_user)
      manager_gets.each do |path|
        get path, headers: { "Authorization" => "Bearer fake" }
        expect(response.status).to eq(403), "Expected #{path} forbidden for customer, got #{response.status}"
      end
    end
  end

  # ---- Staff-or-above endpoints (orders) ----
  describe "staff-or-above endpoints" do
    it "allows staff to list orders" do
      stub_auth_as(staff_user)
      get "/api/v1/admin/orders", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).not_to eq(403)
    end

    it "allows manager to list orders" do
      stub_auth_as(manager_user)
      get "/api/v1/admin/orders", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).not_to eq(403)
    end

    it "denies customer from listing orders" do
      stub_auth_as(customer_user)
      get "/api/v1/admin/orders", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).to eq(403)
    end
  end

  # ---- Refund requires manager_or_above ----
  describe "refund authorization" do
    let(:order) { create(:order) }

    it "denies staff from refunding" do
      stub_auth_as(staff_user)
      post "/api/v1/admin/orders/#{order.id}/refund",
           params: { amount_cents: 100, reason: "test" },
           headers: { "Authorization" => "Bearer fake" }
      expect(response.status).to eq(403)
    end

    it "allows manager to attempt refund" do
      stub_auth_as(manager_user)
      post "/api/v1/admin/orders/#{order.id}/refund",
           params: { amount_cents: 100, reason: "test" },
           headers: { "Authorization" => "Bearer fake" }
      expect(response.status).not_to eq(403)
    end
  end

  # ---- Export requires manager_or_above ----
  describe "export authorization" do
    it "denies staff from exporting" do
      stub_auth_as(staff_user)
      get "/api/v1/admin/orders/export", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).to eq(403)
    end

    it "allows manager to export" do
      stub_auth_as(manager_user)
      get "/api/v1/admin/orders/export", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).not_to eq(403)
    end
  end

  # ---- Summary requires manager_or_above ----
  describe "summary authorization" do
    it "denies staff from summary" do
      stub_auth_as(staff_user)
      get "/api/v1/admin/orders/summary", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).to eq(403)
    end

    it "allows manager to access summary" do
      stub_auth_as(manager_user)
      get "/api/v1/admin/orders/summary", headers: { "Authorization" => "Bearer fake" }
      expect(response.status).not_to eq(403)
    end
  end

  # ---- Me endpoint returns permissions ----
  describe "GET /api/v1/me" do
    it "returns permissions for owner" do
      stub_auth_as(owner_user)
      get "/api/v1/me", headers: { "Authorization" => "Bearer fake" }
      expect(response).to have_http_status(:ok)

      json = JSON.parse(response.body)
      expect(json["role"]).to eq("owner")
      expect(json["permissions"]["can_manage_settings"]).to be true
      expect(json["permissions"]["can_manage_products"]).to be true
      expect(json["permissions"]["can_manage_users"]).to be true
      expect(json["permissions"]["can_view_analytics"]).to be true
      expect(json["permissions"]["can_refund"]).to be true
      expect(json["permissions"]["can_fulfill_orders"]).to be true
      expect(json["permissions"]["can_use_pos"]).to be true
    end

    it "returns permissions for staff" do
      stub_auth_as(staff_user)
      get "/api/v1/me", headers: { "Authorization" => "Bearer fake" }
      json = JSON.parse(response.body)

      expect(json["role"]).to eq("staff")
      expect(json["permissions"]["can_manage_settings"]).to be false
      expect(json["permissions"]["can_manage_products"]).to be false
      expect(json["permissions"]["can_view_analytics"]).to be false
      expect(json["permissions"]["can_refund"]).to be false
      expect(json["permissions"]["can_fulfill_orders"]).to be true
      expect(json["permissions"]["can_use_pos"]).to be true
    end

    it "returns permissions for manager" do
      stub_auth_as(manager_user)
      get "/api/v1/me", headers: { "Authorization" => "Bearer fake" }
      json = JSON.parse(response.body)

      expect(json["role"]).to eq("manager")
      expect(json["permissions"]["can_manage_settings"]).to be false
      expect(json["permissions"]["can_view_analytics"]).to be true
      expect(json["permissions"]["can_refund"]).to be true
      expect(json["permissions"]["can_export"]).to be true
      expect(json["permissions"]["can_fulfill_orders"]).to be true
    end
  end
end
