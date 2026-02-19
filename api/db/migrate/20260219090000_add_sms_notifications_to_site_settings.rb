# frozen_string_literal: true

class AddSmsNotificationsToSiteSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :send_sms_notifications, :boolean, default: false, null: false
    add_column :site_settings, :sms_order_updates, :boolean, default: false, null: false
    add_column :site_settings, :admin_sms_phones, :text, array: true, default: []
  end
end
