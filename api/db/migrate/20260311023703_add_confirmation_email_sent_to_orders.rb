class AddConfirmationEmailSentToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :confirmation_email_sent, :boolean, default: false, null: false
  end
end
