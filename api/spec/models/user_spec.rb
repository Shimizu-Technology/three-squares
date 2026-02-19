# frozen_string_literal: true

require "rails_helper"

RSpec.describe User, type: :model do
  describe "validations" do
    it "is valid with factory defaults" do
      expect(build(:user)).to be_valid
    end

    it "requires a unique clerk_id" do
      create(:user, clerk_id: "clerk_unique_1")
      duplicate = build(:user, clerk_id: "clerk_unique_1")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:clerk_id]).to include("has already been taken")
    end

    it "requires valid email format" do
      user = build(:user, email: "not-an-email")

      expect(user).not_to be_valid
      expect(user.errors[:email]).to be_present
    end

    it "restricts role to customer/staff/manager/owner" do
      %w[ customer staff manager owner ].each do |valid_role|
        user = build(:user, role: valid_role)
        user.assigned_location = create(:location) if valid_role == "staff"
        expect(user).to be_valid, "Expected role '#{valid_role}' to be valid"
      end

      user = build(:user, role: "superadmin")
      expect(user).not_to be_valid
      expect(user.errors[:role]).to include("is not included in the list")
    end

    it "requires assigned_location_id for staff" do
      user = build(:user, role: "staff", assigned_location_id: nil)
      expect(user).not_to be_valid
      expect(user.errors[:assigned_location_id]).to include("is required for staff members")
    end

    it "does not require assigned_location_id for manager" do
      user = build(:user, role: "manager", assigned_location_id: nil)
      expect(user).to be_valid
    end

    it "does not require assigned_location_id for owner" do
      user = build(:user, role: "owner", assigned_location_id: nil)
      expect(user).to be_valid
    end
  end

  describe "role hierarchy" do
    let(:customer) { build(:user, role: "customer") }
    let(:staff) { build(:user, :staff) }
    let(:manager) { build(:user, role: "manager") }
    let(:owner) { build(:user, role: "owner") }

    it "returns correct role levels" do
      expect(customer.role_level).to eq(0)
      expect(staff.role_level).to eq(1)
      expect(manager.role_level).to eq(2)
      expect(owner.role_level).to eq(3)
    end

    it "role predicate methods work" do
      expect(customer.customer?).to be true
      expect(customer.staff?).to be false

      expect(staff.staff?).to be true
      expect(staff.customer?).to be false

      expect(manager.manager?).to be true
      expect(manager.staff?).to be false

      expect(owner.owner?).to be true
      expect(owner.manager?).to be false
    end

    it "manager_or_above? is true for manager and owner" do
      expect(customer.manager_or_above?).to be false
      expect(staff.manager_or_above?).to be false
      expect(manager.manager_or_above?).to be true
      expect(owner.manager_or_above?).to be true
    end

    it "staff_or_above? is true for staff, manager, and owner" do
      expect(customer.staff_or_above?).to be false
      expect(staff.staff_or_above?).to be true
      expect(manager.staff_or_above?).to be true
      expect(owner.staff_or_above?).to be true
    end

    it "admin? returns staff_or_above for backwards compatibility" do
      expect(customer.admin?).to be false
      expect(staff.admin?).to be true
      expect(manager.admin?).to be true
      expect(owner.admin?).to be true
    end
  end

  describe "location_scoped?" do
    let(:location) { create(:location) }

    it "is false for customer" do
      expect(build(:user, role: "customer").location_scoped?).to be false
    end

    it "is true for staff (always has location)" do
      expect(build(:user, role: "staff", assigned_location: location).location_scoped?).to be true
    end

    it "is true for manager with assigned location" do
      expect(build(:user, role: "manager", assigned_location: location).location_scoped?).to be true
    end

    it "is false for manager without assigned location" do
      expect(build(:user, role: "manager").location_scoped?).to be false
    end

    it "is true for owner with assigned location" do
      expect(build(:user, role: "owner", assigned_location: location).location_scoped?).to be true
    end

    it "is false for owner without assigned location" do
      expect(build(:user, role: "owner").location_scoped?).to be false
    end
  end

  describe "defaults" do
    it "defaults role to customer for new records" do
      user = User.new(clerk_id: "clerk_default_role", email: "default-role@example.com")
      expect(user.role).to eq("customer")
    end
  end

  describe "scopes" do
    it "returns users by role" do
      customer = create(:user, role: "customer")
      owner = create(:user, role: "owner")
      staff = create(:user, :staff)

      expect(User.customers).to include(customer)
      expect(User.customers).not_to include(owner)
      expect(User.admins).to include(owner)
      expect(User.admins).to include(staff)
      expect(User.admins).not_to include(customer)
      expect(User.owners).to include(owner)
      expect(User.owners).not_to include(staff)
    end
  end
end
