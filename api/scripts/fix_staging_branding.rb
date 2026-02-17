#!/usr/bin/env ruby
# frozen_string_literal: true

# Fix staging branding: Hafaloha → Three Squares
# Usage: rails runner scripts/fix_staging_branding.rb

settings = SiteSetting.first

unless settings
  puts "❌ No SiteSetting record found. Creating one..."
  settings = SiteSetting.create!(
    store_name: "Three Squares",
    store_email: "info@threesquaresguam.com"
  )
  puts "✅ Created SiteSetting with Three Squares branding."
  exit
end

puts "Current branding:"
puts "  store_name:  #{settings.store_name}"
puts "  store_email: #{settings.store_email}"
puts ""

updates = {}
updates[:store_name] = "Three Squares" if settings.store_name != "Three Squares"
updates[:store_email] = "info@threesquaresguam.com" if settings.store_email != "info@threesquaresguam.com"

if updates.empty?
  puts "✅ Branding already correct. No changes needed."
else
  settings.update!(updates)
  puts "✅ Updated: #{updates.keys.join(', ')}"
  puts "  store_name:  #{settings.reload.store_name}"
  puts "  store_email: #{settings.store_email}"
end
