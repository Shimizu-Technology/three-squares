class AddCateringOnlineOrderingToSiteSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :enable_catering_online_ordering, :boolean, default: false, null: false
  end
end
