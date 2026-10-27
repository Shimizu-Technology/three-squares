# frozen_string_literal: true

module Payments
  class Configuration
    class UnsafeConfiguration < StandardError; end

    def self.production?
      Rails.env.production? || ENV["APP_DEPLOYMENT_ENV"] == "production"
    end

    def self.validate_environment!
      deployment = ENV["APP_DEPLOYMENT_ENV"]
      if production?
        raise UnsafeConfiguration, "Production requires APP_DEPLOYMENT_ENV=production" unless deployment == "production"
        raise UnsafeConfiguration, "Production cannot enable simulation or legacy test mode" if
          (%w[simulated sandbox].include?(ENV["WORLDPAY_MODE"])) || ENV["PAYMENTS_SIMULATION_ENABLED"] == "true" || ENV.fetch("APP_MODE", "test").downcase != "production"
        if ENV["STRIPE_SECRET_KEY"].present? && !ENV["STRIPE_SECRET_KEY"].start_with?("sk_live_")
          raise UnsafeConfiguration, "Production Stripe credentials must be live"
        end
      elsif deployment.present? && !%w[development test staging].include?(deployment)
        raise UnsafeConfiguration, "Unknown deployment environment"
      end
    end

    def self.validate_identity!(identity)
      validate_environment!
      if production? && identity.environment != "production"
        raise UnsafeConfiguration, "Only production payment identities can fulfill production orders"
      end
      if !production? && identity.environment == "production"
        raise UnsafeConfiguration, "Production payments are disabled outside production"
      end
      identity
    end

    def self.validate_database!
      validate_environment!
      return unless production?
      if SiteSetting.table_exists? && SiteSetting.where(payment_test_mode: true).exists?
        raise UnsafeConfiguration, "Disable legacy payment_test_mode before production boot"
      end
      if PaymentProfile.table_exists? && PaymentProfile.joins(:payment_identity).where(enabled: true).where.not(payment_identities: { environment: "production" }).exists?
        raise UnsafeConfiguration, "Production has an enabled nonproduction payment profile"
      end
    end
  end
end
