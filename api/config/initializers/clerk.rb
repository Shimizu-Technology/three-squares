# frozen_string_literal: true

# Clerk SDK configuration
require "clerk"

Clerk.configure do |config|
  clerk_secret_key = ENV["CLERK_SECRET_KEY"]
  if clerk_secret_key.blank? && (Rails.env.production? || Rails.env.staging?)
    raise "CLERK_SECRET_KEY is required in #{Rails.env}"
  end

  # Allow test/development boot without a real Clerk key.
  config.api_key = clerk_secret_key.presence || "test_clerk_secret_key"
  config.logger = Rails.logger
end
