class FixNotificationDefaults < ActiveRecord::Migration[8.1]
  def up
    change_column_default :site_settings, :enable_order_emails, true
    change_column_default :site_settings, :enable_order_sms, true
    # Enable for existing records so deploy doesn't break notifications
    SiteSetting.update_all(enable_order_emails: true, enable_order_sms: true)
  end

  def down
    change_column_default :site_settings, :enable_order_emails, false
    change_column_default :site_settings, :enable_order_sms, false
  end
end
