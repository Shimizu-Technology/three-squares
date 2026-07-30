class AddStaffManagerRolesToUsers < ActiveRecord::Migration[8.1]
  def up
    # Existing 'admin' and 'customer' values remain valid.
    # New values 'staff' and 'manager' are added to the allowed set.
    # No existing records need updating.
    # Rails model validation will enforce the new set going forward.
  end

  def down
    # Downgrade any staff/manager to admin if you need to roll back
    execute "UPDATE users SET role = 'admin' WHERE role IN ('staff', 'manager')"
  end
end
