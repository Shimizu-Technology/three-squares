# frozen_string_literal: true

# Track the last email/SMS event sent per order to prevent duplicate
# status notifications on job retry. Jobs use atomic UPDATE WHERE to
# claim the send — if the event is already set, the job is a no-op.
class AddLastEmailEventToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :last_email_event, :string
    add_column :orders, :last_sms_event, :string
  end
end
