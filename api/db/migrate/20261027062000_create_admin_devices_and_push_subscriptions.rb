class CreateAdminDevicesAndPushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :admin_devices do |t|
      t.string :device_uuid, null: false
      t.string :name, null: false
      t.references :user, foreign_key: true
      t.references :location, foreign_key: true
      t.string :platform
      t.string :browser
      t.string :user_agent
      t.boolean :active, null: false, default: true
      t.datetime :last_seen_at

      t.timestamps
    end

    add_index :admin_devices, :device_uuid, unique: true
    add_index :admin_devices, :active

    create_table :admin_push_subscriptions do |t|
      t.references :admin_device, null: false, foreign_key: true
      t.text :endpoint, null: false
      t.text :p256dh_key, null: false
      t.text :auth_key, null: false
      t.boolean :active, null: false, default: true
      t.datetime :last_sent_at

      t.timestamps
    end

    add_index :admin_push_subscriptions, :endpoint, unique: true
    add_index :admin_push_subscriptions, :active
  end
end
