# frozen_string_literal: true

class ConsolidateNotificationSettings < ActiveRecord::Migration[8.1]
  def up
    add_column :site_settings, :enable_order_emails, :boolean, default: false, null: false
    add_column :site_settings, :enable_order_sms, :boolean, default: false, null: false

    # Migrate from legacy flags: if ANY legacy email flag was true, enable the
    # consolidated toggle so existing deployments don't silently lose emails.
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
  end

  def down
    remove_column :site_settings, :enable_order_emails
    remove_column :site_settings, :enable_order_sms
  end
end
