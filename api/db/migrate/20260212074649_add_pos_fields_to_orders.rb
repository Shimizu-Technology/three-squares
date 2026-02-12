class AddPosFieldsToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :source, :string, default: "online", null: false
    add_column :orders, :staff_created, :boolean, default: false, null: false
    add_column :orders, :payment_method, :string
    add_column :orders, :created_by_user_id, :integer
    add_column :orders, :cash_received_cents, :integer
    add_column :orders, :cash_change_cents, :integer

    add_index :orders, :source
    add_index :orders, :staff_created
  end
end
