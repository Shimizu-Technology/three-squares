class AddSpecialInstructionsToOrderItems < ActiveRecord::Migration[8.0]
  def change
    add_column :order_items, :special_instructions, :text
  end
end
