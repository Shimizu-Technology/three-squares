# This script syncs a Clerk user to the database
# Usage: rails runner scripts/sync_clerk_user.rb

require 'clerk'

puts "🔄 Syncing Clerk users to database..."
puts "=" * 50

begin
  # Fetch all users from Clerk
  clerk_users = Clerk::User.all

  puts "Found #{clerk_users.count} users in Clerk"
  puts ""

  clerk_users.each do |clerk_user|
    email = clerk_user.email_addresses.first&.email_address
    next unless email

    # Find or create user in database
    user = User.find_or_initialize_by(clerk_id: clerk_user.id)
    user.email = email

    # Bootstrap only new/unclassified accounts; retain every explicit role.
    if user.new_record? || user.role.blank?
      user.role = Authenticatable::ADMIN_EMAILS.include?(email.downcase) ? 'owner' : 'customer'
    end

    if user.new_record?
      user.save!
      puts "✅ Created user: #{email} (Admin: #{user.admin?})"
    else
      user.save!
      puts "♻️  Updated user: #{email} (Admin: #{user.admin?})"
    end
  end

  puts ""
  puts "=" * 50
  puts "✅ Sync complete!"
  puts ""
  puts "Current users in database:"
  User.all.each do |u|
    puts "  - #{u.email} (Admin: #{u.admin?})"
  end

rescue StandardError => e
  puts "❌ Error: #{e.message}"
  puts e.backtrace.first(5)
end
