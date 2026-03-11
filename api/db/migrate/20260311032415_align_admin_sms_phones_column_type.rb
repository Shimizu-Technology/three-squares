# Align admin_sms_phones column type between site_settings (text[]) and
# locations (jsonb). Both store the same data — an array of phone strings.
# Standardize on jsonb for consistency.
class AlignAdminSmsPhonesColumnType < ActiveRecord::Migration[8.1]
  def up
    # Drop default first — PG can't auto-cast text[] default to jsonb
    change_column_default :site_settings, :admin_sms_phones, nil
    change_column :site_settings, :admin_sms_phones, :jsonb, using: "array_to_json(admin_sms_phones)::jsonb"
    change_column_default :site_settings, :admin_sms_phones, []
    change_column_null :site_settings, :admin_sms_phones, false
  end

  def down
    change_column_default :site_settings, :admin_sms_phones, nil
    change_column :site_settings, :admin_sms_phones, :text, array: true, using: "ARRAY(SELECT jsonb_array_elements_text(admin_sms_phones))"
    change_column_default :site_settings, :admin_sms_phones, []
  end
end
