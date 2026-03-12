# frozen_string_literal: true

class ConsolidateNotificationSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :enable_order_emails, :boolean, default: true, null: false
    add_column :site_settings, :enable_order_sms, :boolean, default: true, null: false
  end
end
