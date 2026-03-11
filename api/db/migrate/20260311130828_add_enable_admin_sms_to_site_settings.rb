# frozen_string_literal: true

# Explicit admin SMS toggle — independent of customer SMS (enable_order_sms).
# Defaults to true so existing deployments with admin phones configured
# don't lose alerts on deploy.
class AddEnableAdminSmsToSiteSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :enable_admin_sms, :boolean, default: true, null: false
  end
end
