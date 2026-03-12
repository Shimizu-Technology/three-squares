# frozen_string_literal: true

class AddAssignedLocationToUsers < ActiveRecord::Migration[8.1]
  def change
    add_reference :users, :assigned_location, foreign_key: { to_table: :locations }, null: true
  end
end
