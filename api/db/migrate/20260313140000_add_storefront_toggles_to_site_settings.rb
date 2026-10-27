# frozen_string_literal: true

class AddStorefrontTogglesToSiteSettings < ActiveRecord::Migration[7.1]
  def change
    add_column :site_settings, :enable_storefront_three_squares, :boolean, default: true, null: false
    add_column :site_settings, :enable_storefront_latte_stone, :boolean, default: true, null: false
    add_column :site_settings, :enable_storefront_catering, :boolean, default: true, null: false
  end
end
