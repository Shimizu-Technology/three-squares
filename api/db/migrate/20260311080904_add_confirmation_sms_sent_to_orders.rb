# frozen_string_literal: true

class AddConfirmationSmsSentToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :confirmation_sms_sent, :boolean, default: false, null: false
  end
end
