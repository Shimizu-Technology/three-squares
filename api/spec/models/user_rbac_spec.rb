require "rails_helper"

RSpec.describe User, "RBAC foundation", type: :model do
  it "accepts only durable roles and defaults new users to customer" do
    expect(described_class.new.role).to eq("customer")
    %w[customer owner manager].each { |role| expect(build(:user, role: role)).to be_valid }
    [ "admin", "superadmin", "", nil ].each do |role|
      user = build(:user)
      user.role = role
      expect(user).not_to be_valid
      expect(user.errors[:role]).to be_present
    end
  end

  it "requires a real assigned location for staff on creation and subsequent saves" do
    location = create(:location)
    staff = create(:user, role: "staff", assigned_location: location)
    expect(staff).to be_valid
    staff.assigned_location_id = nil
    expect(staff.save).to be(false)
    expect(staff.errors[:assigned_location]).to be_present
    staff.assigned_location_id = location.id + 100
    expect(staff).not_to be_valid
    expect(build(:user, role: "staff")).not_to be_valid
    expect(staff.reload.assigned_location_id).to eq(location.id)
  end

  it "keeps admin compatibility owner-only and owners global regardless of assignment" do
    location = create(:location)
    owner = create(:user, role: "owner", assigned_location: location)
    manager = create(:user, role: "manager", assigned_location: location)
    staff = create(:user, role: "staff", assigned_location: location)
    customer = create(:user)
    expect(owner.admin?).to be(true)
    expect(owner.global_admin?).to be(true)
    expect(owner.location_scoped?).to be(false)
    [ manager, staff, customer, build(:user, role: "admin") ].each do |user|
      expect(user.admin?).to be(false)
      expect(user.global_admin?).to be(false)
    end
    expect(described_class.admins.ids).to eq([ owner.id ])
    expect(described_class.owners.ids).to eq([ owner.id ])
    expect(described_class.customers.ids).to eq([ customer.id ])
    expect(manager.location_scoped?).to be(true)
    expect(staff.location_scoped?).to be(true)
    expect(build(:user, role: "staff").location_scoped?).to be(true)
    expect(owner.access_policy).to be_a(StaffAccessPolicy)
  end

  it "prevents last-owner demotion while allowing ordinary owner updates and promotion" do
    owner = create(:user, role: "owner")
    expect(owner.update(name: "Updated Owner")).to be(true)
    expect(owner.update(role: "manager")).to be(false)
    expect(owner.errors[:base]).to include("Cannot remove the last owner")
    expect(owner.reload.role).to eq("owner")
    other = create(:user)
    expect(other.update(role: "owner")).to be(true)
    expect(owner.update(role: "manager")).to be(true)
    expect(other.update(role: "customer")).to be(false)
    expect(described_class.owners.ids).to eq([ other.id ])
  end

  it "rejects last-owner deletion before dependent associations change" do
    owner = create(:user, role: "owner")
    device = AdminDevice.create!(user: owner, device_uuid: "rbac-owner-device", name: "Owner iPad")
    expect(owner.destroy).to be(false)
    expect(owner.errors[:base]).to include("Cannot remove the last owner")
    expect(owner).not_to be_destroyed
    expect(device.reload.user_id).to eq(owner.id)
    other = create(:user, role: "owner")
    expect(owner.destroy).to eq(owner)
    expect(device.reload.user_id).to be_nil
    expect(other.destroy).to be(false)
  end

  it "checks the persisted role after locking even for stale instances" do
    stale = create(:user)
    # Simulates another transaction having promoted this object after it loaded.
    described_class.where(id: stale.id).update_all(role: "owner")
    expect(stale.destroy).to be(false)
    expect(stale.update(name: "Would restore stale customer role", role: "customer")).to be(false)
    expect(stale.reload.role).to eq("owner")
  end
end
