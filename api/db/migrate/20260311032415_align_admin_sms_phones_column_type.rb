# frozen_string_literal: true

# Originally converted admin_sms_phones from text[] to jsonb.
# Now the column is created as jsonb in 20260219090000, so this migration
# is a no-op. Kept for idempotency in case any environment already ran
# the old version of 20260219090000 with text[].
class AlignAdminSmsPhonesColumnType < ActiveRecord::Migration[8.1]
  def up
    column = columns(:site_settings).find { |c| c.name == "admin_sms_phones" }
    return if column&.sql_type == "jsonb" # Already correct

    change_column_default :site_settings, :admin_sms_phones, nil
    change_column :site_settings, :admin_sms_phones, :jsonb, using: "array_to_json(admin_sms_phones)::jsonb"
    change_column_default :site_settings, :admin_sms_phones, []
    change_column_null :site_settings, :admin_sms_phones, false
  end

  def down
    # No-op — column stays as jsonb regardless
  end
end
