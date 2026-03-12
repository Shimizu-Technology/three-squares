# frozen_string_literal: true

# Replace string-based last_email_event / last_sms_event with integer
# sequence counters. Jobs pass a monotonically increasing seq number
# and only execute if their seq > last_*_seq, which prevents both
# duplicates AND out-of-order execution.
class ReplaceLastEventWithSequenceNumbers < ActiveRecord::Migration[8.1]
  def up
    add_column :orders, :last_email_seq, :integer, default: 0, null: false
    add_column :orders, :last_sms_seq, :integer, default: 0, null: false
    remove_column :orders, :last_email_event
    remove_column :orders, :last_sms_event
  end

  def down
    add_column :orders, :last_email_event, :string
    add_column :orders, :last_sms_event, :string
    remove_column :orders, :last_email_seq
    remove_column :orders, :last_sms_seq
  end
end
