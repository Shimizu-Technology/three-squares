# frozen_string_literal: true

class UpdateUserRolesForRbac < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE users SET role = 'owner' WHERE role = 'admin'"
  end

  def down
    execute "UPDATE users SET role = 'admin' WHERE role = 'owner'"
  end
end
