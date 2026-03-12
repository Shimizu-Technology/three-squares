# frozen_string_literal: true

# Drop legacy SMS columns that were superseded by enable_order_sms in
# migration 20260219110000. No application code reads or writes these.
class DropLegacySmsColumns < ActiveRecord::Migration[8.1]
  def up
    remove_column :site_settings, :send_sms_notifications, :boolean
    remove_column :site_settings, :sms_order_updates, :boolean
  end

  def down
    add_column :site_settings, :send_sms_notifications, :boolean, default: false, null: false
    add_column :site_settings, :sms_order_updates, :boolean, default: false, null: false
  end
end
