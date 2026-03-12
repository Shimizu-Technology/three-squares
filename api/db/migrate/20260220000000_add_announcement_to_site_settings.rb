# frozen_string_literal: true

class AddAnnouncementToSiteSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :site_settings, :announcement_enabled, :boolean, default: false, null: false
    add_column :site_settings, :announcement_text, :string, null: true
    add_column :site_settings, :announcement_style, :string, default: "gold", null: false
  end
end
