require "rails_helper"
require Rails.root.join("db/migrate/20261027080000_convert_admin_roles_to_owner")

RSpec.describe ConvertAdminRolesToOwner do
  it "converts populated legacy admins while preserving explicit roles, assignments and profile data" do
    location = create(:location)
    now = Time.current.change(usec: 0)
    rows = %w[admin admin owner manager staff customer].each_with_index.map do |role, index|
      {
        clerk_id: "rbac-migration-#{index}", email: "rbac-migration-#{index}@example.test",
        name: "Profile #{index}", phone: "671-555-0100", role: role,
        assigned_location_id: index.even? ? location.id : nil,
        created_at: now, updated_at: now
      }
    end
    User.insert_all!(rows)
    users = User.where(clerk_id: rows.pluck(:clerk_id)).order(:clerk_id)
    expected = users.map { |user| user.attributes.merge("role" => user.role == "admin" ? "owner" : user.role) }
    2.times do
      ActiveRecord::Migration.suppress_messages { described_class.new.migrate(:up) }
      expect(users.reload.map(&:attributes)).to eq(expected)
    end
    expect(User.where(role: "admin")).not_to exist
  end

  it "refuses a rollback that would demote explicit owners or promote explicit roles" do
    expect { described_class.new.migrate(:down) }.to raise_error(ActiveRecord::IrreversibleMigration)
  end
end
