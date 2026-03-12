class FixNotificationDefaults < ActiveRecord::Migration[8.1]
  def up
    change_column_default :site_settings, :enable_order_emails, true
    change_column_default :site_settings, :enable_order_sms, true
    # NOTE: These update_all calls are intentionally no-ops in most environments.
    # The prior migration (consolidate_notification_settings) used ADD COLUMN ... DEFAULT true,
    # which backfills existing rows in PostgreSQL, so enable_order_emails/sms will never be nil.
    # This migration only changes column defaults (no-op since they already match) and backfills
    # nil values as a safety net for edge cases (e.g., interrupted migrations, non-PG databases).
    SiteSetting.where(enable_order_emails: nil).update_all(enable_order_emails: true)
    SiteSetting.where(enable_order_sms: nil).update_all(enable_order_sms: true)
  end

  def down
    change_column_default :site_settings, :enable_order_emails, false
    change_column_default :site_settings, :enable_order_sms, false
  end
end
