# frozen_string_literal: true

# Stripe API configuration
# https://stripe.com/docs/api

# Check if we're running in test mode or production mode
APP_MODE = ENV.fetch("APP_MODE", "test").downcase

# Support both canonical and *_TEST env naming.
secret_key =
  if APP_MODE == "test"
    ENV["STRIPE_SECRET_KEY_TEST"].presence || ENV["STRIPE_SECRET_KEY"].presence
  else
    ENV["STRIPE_SECRET_KEY"].presence
  end

publishable_key =
  if APP_MODE == "test"
    ENV["STRIPE_PUBLISHABLE_KEY_TEST"].presence || ENV["STRIPE_PUBLISHABLE_KEY"].presence
  else
    ENV["STRIPE_PUBLISHABLE_KEY"].presence
  end

if secret_key.present?
  Stripe.api_key = secret_key
  STRIPE_ENABLED = true
  STRIPE_PUBLISHABLE_KEY = publishable_key

  mode_label = APP_MODE == "test" ? "TEST" : "PRODUCTION"
  Rails.logger.info "💳 Running in #{mode_label} mode - Stripe API key configured"
  Rails.logger.info "   Publishable Key: #{STRIPE_PUBLISHABLE_KEY&.slice(0, 12)}..." if STRIPE_PUBLISHABLE_KEY.present?
else
  STRIPE_ENABLED = false
  STRIPE_PUBLISHABLE_KEY = APP_MODE == "test" ? "pk_test_simulated" : nil

  if APP_MODE == "test"
    Rails.logger.warn "⚠️  TEST mode without Stripe keys - using simulated payment intents"
  else
    Rails.logger.warn "⚠️  STRIPE_SECRET_KEY not set - payments will fail in production mode"
  end
end

# Make constants available globally
Rails.application.config.stripe_enabled = STRIPE_ENABLED
Rails.application.config.stripe_publishable_key = STRIPE_PUBLISHABLE_KEY
Rails.application.config.app_mode = APP_MODE
