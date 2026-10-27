class ConvertAdminRolesToOwner < ActiveRecord::Migration[8.1]
  def up
    # Do not instantiate User: its accepted roles intentionally exclude admin.
    # Preserve every explicit newer role and any assignment/profile data.
    execute "UPDATE users SET role = 'owner' WHERE role = 'admin'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Role conversion cannot safely infer former admins"
  end
end
