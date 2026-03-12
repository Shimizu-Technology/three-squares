# frozen_string_literal: true

# Move refund notification idempotency flags from orders (per-order) to
# refunds (per-refund). Per-order booleans block notifications for all
# subsequent partial refunds after the first one.
class MoveRefundNotificationFlagsToRefunds < ActiveRecord::Migration[8.1]
  def up
    add_column :refunds, :email_sent, :boolean, default: false, null: false
    add_column :refunds, :sms_sent, :boolean, default: false, null: false
    remove_column :orders, :refund_email_sent
    remove_column :orders, :refund_sms_sent
  end

  def down
    add_column :orders, :refund_email_sent, :boolean, default: false, null: false
    add_column :orders, :refund_sms_sent, :boolean, default: false, null: false
    remove_column :refunds, :email_sent
    remove_column :refunds, :sms_sent
  end
end
