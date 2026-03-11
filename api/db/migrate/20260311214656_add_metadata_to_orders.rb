class AddMetadataToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :metadata, :jsonb, default: {}, null: false
  end
end
