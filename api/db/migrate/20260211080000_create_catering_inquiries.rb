class CreateCateringInquiries < ActiveRecord::Migration[8.1]
  def change
    create_table :catering_inquiries do |t|
      t.string :contact_name, null: false
      t.string :contact_email, null: false
      t.string :contact_phone
      t.string :company_name
      t.string :event_type, null: false  # wedding, corporate, party, etc.
      t.date :event_date, null: false
      t.string :event_time
      t.integer :guest_count, null: false
      t.string :budget_range  # e.g., "$500-1000", "$1000-2000"
      t.text :venue_address
      t.text :menu_preferences
      t.text :special_requests
      t.text :dietary_restrictions
      t.string :status, null: false, default: 'pending'  # pending, quoted, accepted, declined, completed
      t.text :admin_notes
      t.decimal :quoted_amount, precision: 10, scale: 2
      t.datetime :quoted_at
      t.references :responded_by, foreign_key: { to_table: :users }

      t.timestamps
    end

    add_index :catering_inquiries, :status
    add_index :catering_inquiries, :event_date
  end
end
