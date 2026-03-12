# frozen_string_literal: true

# Explicit admin SMS toggle — independent of customer SMS (enable_order_sms).
# Uses 3-step pattern: add as false → enable where phones configured → set default true.
class AddEnableAdminSmsToSiteSettings < ActiveRecord::Migration[8.1]
  def up
    # Step 1: Add as false — existing deployments start with admin SMS OFF
    add_column :site_settings, :enable_admin_sms, :boolean, default: false, null: false

    # Step 2: Auto-enable only for deployments that already have admin phones
    execute <<~SQL
      UPDATE site_settings
      SET enable_admin_sms = TRUE
      WHERE admin_sms_phones IS NOT NULL
        AND admin_sms_phones != '[]'::jsonb
    SQL

    # Step 3: New deployments get admin SMS enabled by default
    change_column_default :site_settings, :enable_admin_sms, true
  end

  def down
    remove_column :site_settings, :enable_admin_sms
  end
end
