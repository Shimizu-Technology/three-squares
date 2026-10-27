# frozen_string_literal: true

class AddProviderFieldsToPayments < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :payment_provider, :string
    add_column :orders, :payment_reference, :string
    add_column :orders, :payment_session_id, :string

    add_column :refunds, :payment_provider, :string
    add_column :refunds, :provider_refund_id, :string

    add_index :orders, [ :payment_provider, :payment_reference ], name: "index_orders_on_payment_provider_and_reference"
    add_index :orders, :payment_session_id
    add_index :refunds, :provider_refund_id, unique: true
  end
end
