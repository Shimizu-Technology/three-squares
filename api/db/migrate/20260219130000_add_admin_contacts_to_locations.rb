# frozen_string_literal: true

class AddAdminContactsToLocations < ActiveRecord::Migration[8.1]
  def change
    add_column :locations, :admin_sms_phones, :jsonb, default: [], null: false
    add_column :locations, :admin_email, :string
  end
end
