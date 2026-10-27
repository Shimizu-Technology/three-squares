#!/usr/bin/env ruby
# Quick verification script for environment setup
# Run with: bin/rails runner scripts/verify_environment.rb

puts "=" * 80
puts "🔍 HAFALOHA ENVIRONMENT VERIFICATION"
puts "=" * 80
puts ""

errors = []
warnings = []

# Check 1: Database Connection
puts "1️⃣  Checking Database Connection..."
begin
  ActiveRecord::Base.connection.execute("SELECT 1")
  db_name = ActiveRecord::Base.connection.current_database
  puts "   ✅ Connected to: #{db_name}"
rescue => e
  errors << "Database error: #{e.message}"
end
puts ""

# Check 2: Clerk Configuration
puts "2️⃣  Checking Clerk Configuration..."
clerk_secret = ENV['CLERK_SECRET_KEY']
clerk_public = ENV['CLERK_PUBLISHABLE_KEY']

if clerk_secret && clerk_secret.start_with?('sk_')
  puts "   ✅ CLERK_SECRET_KEY configured"
else
  warnings << "CLERK_SECRET_KEY missing or invalid"
end

if clerk_public && (clerk_public.start_with?('pk_test_') || clerk_public.start_with?('pk_live_'))
  puts "   ✅ CLERK_PUBLISHABLE_KEY configured"
else
  warnings << "CLERK_PUBLISHABLE_KEY missing or invalid"
end
puts ""

# Check 3: AWS S3 Configuration
puts "3️⃣  Checking AWS S3 Configuration..."
aws_key_id = ENV['AWS_ACCESS_KEY_ID']
aws_secret = ENV['AWS_SECRET_ACCESS_KEY']
aws_region = ENV['AWS_REGION']
aws_bucket = ENV['AWS_S3_BUCKET']

if aws_key_id && aws_key_id.start_with?('AKIA')
  puts "   ✅ AWS_ACCESS_KEY_ID configured"
else
  warnings << "AWS_ACCESS_KEY_ID missing or invalid"
end

if aws_secret && aws_secret.length > 20
  puts "   ✅ AWS_SECRET_ACCESS_KEY configured"
else
  warnings << "AWS_SECRET_ACCESS_KEY missing"
end

if aws_region
  puts "   ✅ AWS_REGION: #{aws_region}"
else
  warnings << "AWS_REGION missing"
end

if aws_bucket
  puts "   ✅ AWS_S3_BUCKET: #{aws_bucket}"
else
  warnings << "AWS_S3_BUCKET missing"
end
puts ""

# Check 4: Active Storage Service
puts "4️⃣  Checking Active Storage..."
service = Rails.configuration.active_storage.service
puts "   ℹ️  Service: #{service}"
if service == :local
  puts "   ⚠️  Using local storage (development mode)"
elsif service == :amazon
  puts "   ✅ Using S3 storage"
end
puts ""

# Check 5: Database Models
puts "5️⃣  Checking Database Models & Data..."
begin
  user_count = User.count
  product_count = Product.count
  collection_count = Collection.count
  variant_count = ProductVariant.count

  puts "   ✅ Users: #{user_count} (Admins: #{User.where(role: 'owner').count})"
  puts "   ✅ Products: #{product_count} (Published: #{Product.where(published: true).where(deleted_at: nil).count rescue product_count})"
  puts "   ✅ Collections: #{collection_count}"
  puts "   ✅ Product Variants: #{variant_count}"

  if product_count == 0
    warnings << "No products found. Run test_admin_api.rb to create sample data."
  end
rescue => e
  errors << "Model check error: #{e.message}"
end
puts ""

# Check 6: CORS Configuration
puts "6️⃣  Checking CORS Configuration..."
frontend_url = ENV['FRONTEND_URL']
if frontend_url
  puts "   ✅ FRONTEND_URL: #{frontend_url}"
else
  warnings << "FRONTEND_URL missing (CORS may not work)"
end
puts ""

# Check 7: Rails Environment
puts "7️⃣  Checking Rails Environment..."
puts "   ℹ️  Environment: #{Rails.env}"
puts "   ℹ️  Rails Version: #{Rails.version}"
puts "   ℹ️  Ruby Version: #{RUBY_VERSION}"
puts ""

# Summary
puts "=" * 80
puts "📊 SUMMARY"
puts "=" * 80

if errors.empty? && warnings.empty?
  puts "🎉 All checks passed! Environment is ready."
  puts ""
  puts "✅ Database: Connected"
  puts "✅ Clerk: Configured"
  puts "✅ AWS S3: Configured"
  puts "✅ Models: Working"
  puts "✅ Test Data: Present"
  puts ""
  puts "🚀 Ready to start development!"
elsif errors.any?
  puts "❌ ERRORS FOUND:"
  errors.each { |e| puts "   • #{e}" }
  puts ""
  puts "⚠️  Fix these errors before continuing."
  exit 1
elsif warnings.any?
  puts "⚠️  WARNINGS:"
  warnings.each { |w| puts "   • #{w}" }
  puts ""
  puts "Some features may not work without these configurations."
  puts "See docs-v2/API-KEYS-SETUP.md for setup instructions."
end

puts "=" * 80
puts ""

# Print helpful next steps
if warnings.include?("CLERK_SECRET_KEY missing or invalid") || warnings.include?("CLERK_PUBLISHABLE_KEY missing or invalid")
  puts "🔑 To set up Clerk:"
  puts "   1. Go to https://clerk.com and create an account"
  puts "   2. Create a new application"
  puts "   3. Copy API keys to hafaloha-api/.env"
  puts "   4. See docs-v2/API-KEYS-SETUP.md for details"
  puts ""
end

if warnings.include?("AWS_ACCESS_KEY_ID missing or invalid") || warnings.include?("AWS_SECRET_ACCESS_KEY missing")
  puts "☁️  To set up AWS S3:"
  puts "   1. Create an S3 bucket"
  puts "   2. Create IAM user with S3 permissions"
  puts "   3. Copy credentials to hafaloha-api/.env"
  puts "   4. See docs-v2/API-KEYS-SETUP.md for details"
  puts ""
end

if warnings.include?("No products found. Run test_admin_api.rb to create sample data.")
  puts "📦 To create sample data:"
  puts "   bin/rails runner scripts/test_admin_api.rb"
  puts ""
end
