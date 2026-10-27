# frozen_string_literal: true

module Payments
  class ProviderResolver
    def self.profile!(location_id:, channel:)
      provider = SiteSetting.first&.payment_processor.presence || ENV.fetch("PAYMENTS_DEFAULT_PROVIDER", "worldpay")
      profiles = PaymentProfile.where(enabled: true, channel: channel, provider: provider)
      profile = profiles.where(location_id: location_id).first
      profile ||= profiles.where(location_id: nil).first
      raise Configuration::UnsafeConfiguration, "No enabled payment profile for this location/channel" unless profile
      Configuration.validate_identity!(profile.payment_identity)
      profile
    end

    def self.for_identity(identity)
      Configuration.validate_identity!(identity)
      return Simulation::Provider.new(identity) if identity.environment == "simulated"
      case identity.provider
      when "stripe" then StripeProvider.new(identity)
      else raise UnsupportedCapability, "Worldpay collection is not installed yet"
      end
    end
  end
end
