class DisableCookieStorefrontForLaunch < ActiveRecord::Migration[8.1]
  def up
    change_column_default :site_settings, :enable_storefront_latte_stone, false
    execute "UPDATE site_settings SET enable_storefront_latte_stone = FALSE"
  end

  def down
    # Do not silently reopen a storefront when rolling back.
    raise ActiveRecord::IrreversibleMigration, "Cookies must be explicitly enabled after launch readiness"
  end
end
