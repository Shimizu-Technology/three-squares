# frozen_string_literal: true

module Payments
  class ProvisionStripe
    def self.call(apply: false, output: $stdout)
      Configuration.validate_database!
      environment = if Rails.env.staging?
        "sandbox"
      elsif Rails.env.production?
        "production"
      else
        raise Configuration::UnsafeConfiguration, "Stripe provisioning requires Rails staging or production"
      end
      slot = environment == "sandbox" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY"
      key = ENV[slot]
      prefixes = environment == "sandbox" ? %w[sk_test_ rk_test_] : %w[sk_live_ rk_live_]
      unless key&.start_with?(*prefixes)
        raise Configuration::UnsafeConfiguration, "Stripe credential mode does not match provisioning environment"
      end

      # Explicit per-request key, no global-key fallback or caller-supplied account.
      # GET /v1/account verifies the account that owns this environment's slot.
      account = Stripe::Account.retrieve(nil, { api_key: key })
      account_id = account.id.to_s
      unless account_id.match?(/\Aacct_[A-Za-z0-9]+\z/)
        raise Configuration::UnsafeConfiguration, "Stripe returned an invalid account ID"
      end
      if ENV["STRIPE_WEBHOOK_ACCOUNT_ID"].present? && ENV["STRIPE_WEBHOOK_ACCOUNT_ID"] != account_id
        raise Configuration::UnsafeConfiguration, "Stripe webhook account does not match the authenticated account"
      end
      attributes = { provider: "stripe", environment: environment, external_account_id: account_id,
        external_acceptor_id: nil, credential_reference: "stripe_default", currency: "USD",
        profile_key: "stripe_default:#{environment}:#{account_id}" }

      # Serialize repeated apply runs through the existing singleton. Never change
      # an identity, reroute a conflicting profile, or touch POS/Terminal profiles.
      PaymentIdentity.transaction do
        settings = SiteSetting.first
        raise Configuration::UnsafeConfiguration, "Initialize site settings before provisioning Stripe" unless settings
        settings.lock! if apply
        identity = PaymentIdentity.find_or_initialize_by(profile_key: attributes.fetch(:profile_key))
        if identity.persisted? && attributes.any? { |name, value| identity.public_send(name) != value }
          raise Configuration::UnsafeConfiguration, "Existing Stripe identity conflicts with authenticated account"
        end
        identity.assign_attributes(attributes) if identity.new_record?
        profiles = PaymentProfile.where(provider: "stripe", channel: "online")
        if profiles.where(enabled: true).any? { |row| row.payment_identity_id != identity.id || row.presentation != "stripe_embedded" }
          raise Configuration::UnsafeConfiguration, "Conflicting enabled Stripe online profile; reconcile it before provisioning"
        end
        defaults = profiles.where(location_id: nil)
        raise Configuration::UnsafeConfiguration, "Ambiguous Stripe online defaults" if defaults.count > 1
        profile = defaults.first || profiles.new(location_id: nil)
        if profile.persisted? && (profile.payment_identity_id != identity.id || profile.presentation != "stripe_embedded")
          raise Configuration::UnsafeConfiguration, "Existing Stripe online default conflicts; reconcile it before provisioning"
        end
        output.puts "#{apply ? 'Apply' : 'DRY RUN'}: #{environment} Stripe account #{account_id}; identity #{attributes.fetch(:profile_key)}"
        output.puts "#{identity.persisted? ? 'Reuse' : 'Create'} immutable USD stripe_default identity; enable default online stripe_embedded profile; set payment_processor=stripe. POS profiles unchanged."
        if apply
          identity.save! if identity.new_record?
          profile.assign_attributes(payment_identity: identity, presentation: "stripe_embedded", enabled: true)
          profile.save! if profile.changed?
          settings.update!(payment_processor: "stripe") unless settings.payment_processor == "stripe"
        end
      end
    end
  end
end
