require "rails_helper"

RSpec.describe StaffAccessPolicy do
  let!(:main) { create(:location, name: "Main", admin_sms_phones: [ "+16715550100" ]) }
  let!(:other) { create(:location, name: "Other") }

  def policy(role, location: nil)
    described_class.new(build(:user, role: role, assigned_location: location))
  end

  # Expected permissions are intentionally explicit: additions to the registry
  # must be classified here before they can silently reach a lower role.
  let(:staff_names) do
    %w[orders.read orders.counts orders.status pos.sell payments.collect availability.manage devices.self]
  end
  let(:manager_names) do
    staff_names + %w[orders.manage orders.notify orders.export payments.refund analytics.read devices.manage
      locations.read locations.update locations.qr catalog.manage catalog.import stock.read seasonal.manage catering.manage]
  end
  let(:global_manager_names) do
    manager_names + %w[stock.manage homepage.manage payments.terminals.manage]
  end
  let(:owner_names) do
    global_manager_names + %w[users.manage settings.manage payment_settings.manage locations.manage
      payments.simulate payments.terminals.discover]
  end

  it "classifies every registered capability in the complete role/assignment matrix" do
    invalid_staff = policy("staff")
    invalid_staff.user.assigned_location_id = Location.maximum(:id) + 100
    invalid_manager = policy("manager")
    invalid_manager.user.assigned_location_id = Location.maximum(:id) + 100
    cases = [
      [ policy("owner", location: main), owner_names ],
      [ policy("manager"), global_manager_names ],
      [ policy("manager", location: main), manager_names ],
      [ policy("staff", location: main), staff_names ],
      [ policy("staff"), [] ],
      [ invalid_staff, [] ],
      [ invalid_manager, %w[catalog.manage catalog.import stock.read seasonal.manage catering.manage] ],
      [ policy("customer", location: main), [] ]
    ]
    expect(described_class::CAPABILITIES).to match_array(owner_names + [ "account.self" ])
    cases.each do |access, expected|
      expect(access.capabilities).to match_array(expected + [ "account.self" ])
      described_class::CAPABILITIES.each do |name|
        expect(access.allowed?(name)).to eq((expected + [ "account.self" ]).include?(name)),
          "#{access.user.role}/#{access.operational_scope}: #{name}"
      end
    end
    expect(described_class.new(nil).capabilities).to eq([])
    expect(policy("admin").capabilities).to eq([])
    expect(policy("unknown").capabilities).to eq([])
  end

  it "defaults unknown actions and unclassified controls to owner only" do
    %w[unclassified.action locations.manage payment_settings.manage payments.simulate payments.terminals.discover].each do |name|
      expect(policy("owner").allowed?(name)).to be(true)
      [ policy("manager"), policy("staff", location: main), policy("customer"), described_class.new(nil) ].each do |access|
        expect(access.allowed?(name)).to be(false)
      end
    end
  end

  it "keeps staff queue counts and individual order/POS reads separate from aggregate revenue and exports" do
    access = policy("staff", location: main)
    %w[orders.read orders.counts pos.sell].each { |name| expect(access.allowed?(name)).to be(true) }
    %w[analytics.read orders.export payments.refund orders.manage orders.notify stock.read].each do |name|
      expect(access.allowed?(name)).to be(false)
    end
  end

  it "always grants owners all locations even with an assignment" do
    access = policy("owner", location: main)
    expect(access.operational_scope).to eq(:all)
    expect(access.authorized_location_ids).to match_array(Location.ids)
    expect(access.location_allowed?(other)).to be(true)
  end

  it "gives blank managers all operations, assigned managers specific operations, and both global shared capabilities" do
    global = policy("manager")
    assigned = policy("manager", location: main)
    expect(global.operational_scope).to eq(:all)
    expect(global.authorized_location_ids).to match_array(Location.ids)
    expect(assigned.operational_scope).to eq(:specific)
    expect(assigned.authorized_location_ids).to eq([ main.id ])
    expect(assigned.allowed?("orders.read", location_id: other.id)).to be(false)
    expect(assigned.allowed?("orders.read", location_id: main.id)).to be(true)
    %w[catalog.manage catalog.import stock.read seasonal.manage catering.manage].each do |name|
      expect(assigned.allowed?(name)).to be(true)
    end
  end

  it "reserves shared-stock writes, merchandising and terminal provisioning for all-location managers" do
    %w[stock.manage homepage.manage payments.terminals.manage].each do |name|
      expect(policy("manager").allowed?(name)).to be(true)
      expect(policy("manager", location: main).allowed?(name)).to be(false)
      expect(policy("staff", location: main).allowed?(name)).to be(false)
    end
  end

  it "denies blank/invalid staff scope and invalid manager operational scope without denying manager global capabilities" do
    [ "staff", "manager" ].each do |role|
      access = policy(role)
      access.user.assigned_location_id = Location.maximum(:id) + 100
      expect(access.operational_scope).to eq(:none)
      expect(access.allowed?("orders.read")).to be(false)
      expect(access.location_choices).to eq([])
      expect(access.allowed?("catalog.manage")).to eq(role == "manager")
    end
    [ policy("staff"), policy("customer", location: main), described_class.new(nil) ].each do |access|
      expect(access.operational_scope).to eq(:none)
      expect(access.authorized_location_ids).to eq([])
      expect(access.location_allowed?(main.id)).to be(false)
    end
  end

  it "allows location selection only inside scope and rejects malformed/forged IDs" do
    access = policy("staff", location: main)
    expect(access.location_allowed?(main.id.to_s)).to be(true)
    [ other.id, nil, "", "all", "#{main.id}junk", "#{main.id},#{other.id}", 0, -1, Location.maximum(:id) + 100 ].each do |id|
      expect(access.location_allowed?(id)).to be(false)
      expect(access.allowed?("pos.sell", location_id: id)).to be(false) unless id.nil?
    end
    expect(policy("owner").allowed?("pos.sell", location_id: "forged")).to be(false)
    expect(policy("manager").location_allowed?("forged")).to be(false)
  end

  it "scopes relations including locationless records without changing existing filters" do
    mine = create(:user, assigned_location: main)
    theirs = create(:user, assigned_location: other)
    locationless = create(:user)
    relation = User.where(id: [ mine.id, theirs.id, locationless.id ])
    expect(policy("owner", location: main).scope_relation(relation, location_column: :assigned_location_id).ids)
      .to match_array([ mine.id, theirs.id, locationless.id ])
    expect(policy("manager").scope_relation(relation, location_column: :assigned_location_id).ids)
      .to match_array([ mine.id, theirs.id, locationless.id ])
    %w[manager staff].each do |role|
      expect(policy(role, location: main).scope_relation(relation, location_column: :assigned_location_id).ids).to eq([ mine.id ])
    end
    expect(policy("staff").scope_relation(relation, location_column: :assigned_location_id)).to be_empty
    expect(policy("customer").scope_relation(relation, location_column: :assigned_location_id)).to be_empty
  end

  it "returns only minimal safe authorized location labels and refreshes invalidated assignments" do
    access = policy("staff", location: main)
    expect(access.location_choices).to eq([ { id: main.id, name: "Main", slug: main.slug } ])
    expect(access.location_choices.first.keys).to match_array(%i[id name slug])
    access.user.assigned_location_id = nil
    expect(access.location_choices).to eq([])
    expect(access.capabilities).to eq([ "account.self" ])
  end

  it "never grants device access from a device location or another user's same-location UUID" do
    staff = create(:user, role: "staff", assigned_location: main)
    access = described_class.new(staff)
    own = AdminDevice.new(user_id: staff.id, location_id: main.id)
    forged = AdminDevice.new(user_id: staff.id + 100, location_id: main.id)
    elsewhere = AdminDevice.new(user_id: staff.id, location_id: other.id)
    expect(access.allowed?("devices.self", device: own)).to be(true)
    [ forged, elsewhere, AdminDevice.new(user_id: staff.id) ].each do |device|
      expect(access.allowed?("devices.self", device: device)).to be(false)
    end
    staff.assigned_location_id = nil
    expect(access.allowed?("devices.self", device: own)).to be(false)
    expect(access.owns_device?(own)).to be(false)
  end
end
