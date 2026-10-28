class AddOfferedToProductLocations < ActiveRecord::Migration[8.0]
  def change
    # Old false rows may mean sold out today. Never infer menu membership.
    add_column :product_locations, :offered, :boolean, default: true, null: false
  end
end
