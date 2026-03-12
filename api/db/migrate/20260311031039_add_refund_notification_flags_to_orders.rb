class AddRefundNotificationFlagsToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :refund_email_sent, :boolean, default: false, null: false
    add_column :orders, :refund_sms_sent, :boolean, default: false, null: false
  end
end
