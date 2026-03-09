class FixNotificationDefaults < ActiveRecord::Migration[8.1]
  def up
    change_column_default :site_settings, :enable_order_emails, true
    change_column_default :site_settings, :enable_order_sms, true
    # Only set defaults where column is nil — don't silently opt in existing records
    SiteSetting.where(enable_order_emails: nil).update_all(enable_order_emails: true)
    SiteSetting.where(enable_order_sms: nil).update_all(enable_order_sms: true)
  end

  def down
    change_column_default :site_settings, :enable_order_emails, false
    change_column_default :site_settings, :enable_order_sms, false
  end
end
