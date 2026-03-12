# frozen_string_literal: true

class ConsolidateNotificationSettings < ActiveRecord::Migration[8.1]
  def up
    # Step 1: Add columns with default FALSE so existing rows start disabled.
    # This ensures the data migration below can selectively enable based on
    # legacy flags — rows that had notifications OFF stay OFF.
    add_column :site_settings, :enable_order_emails, :boolean, default: false, null: false
    add_column :site_settings, :enable_order_sms, :boolean, default: false, null: false

    # Step 2: Migrate from legacy flags. Only enable the new toggles where
    # the old per-type flags were explicitly true.
    execute <<~SQL
      UPDATE site_settings
      SET enable_order_emails = TRUE
      WHERE send_customer_emails = TRUE
         OR send_retail_emails = TRUE
         OR send_wholesale_emails = TRUE
    SQL

    execute <<~SQL
      UPDATE site_settings
      SET enable_order_sms = TRUE
      WHERE send_sms_notifications = TRUE
    SQL

    # Step 3: Now change the column default to TRUE for NEW rows created after
    # this migration. Existing rows retain their migrated values.
    change_column_default :site_settings, :enable_order_emails, true
    change_column_default :site_settings, :enable_order_sms, true
  end

  def down
    remove_column :site_settings, :enable_order_emails
    remove_column :site_settings, :enable_order_sms
  end
end
