# frozen_string_literal: true

module Payments
  module Simulation
    # Shared by the fictional fixture seed and the local restaurant-menu demo.
    module Fixtures
      def self.identity!
        identity = PaymentIdentity.find_or_initialize_by(profile_key: 'local-simulator')
        if identity.new_record?
          identity.assign_attributes(provider: 'worldpay', environment: 'simulated',
            external_account_id: 'local-fictional-merchant', credential_reference: 'simulation')
        end
        Guard.validate!(identity)
        identity.save! if identity.new_record?
        identity
      end

      def self.provision_locations!(identity:, locations:)
        Guard.validate!(identity)
        locations.each do |location|
          profiles = %w[online pos].index_with do |channel|
            PaymentProfile.find_or_create_by!(payment_identity: identity, provider: 'worldpay', channel: channel, location: location) do |row|
              row.assign_attributes(presentation: channel == 'online' ? 'worldpay_hosted_fields' : 'worldpay_terminal', enabled: true)
            end
          end
          # The location-based key is stable across repeated demo preparations.
          lane = location.slug.start_with?('simulation-') ? "sim-#{location.slug.delete_prefix('simulation-')}" : "demo-#{location.id}"
          PaymentTerminal.find_or_create_by!(payment_identity: identity, lane_id: lane) do |row|
            row.assign_attributes(location: location, payment_profile: profiles.fetch('pos'), connection_state: 'connected',
              terminal_id: "sim-terminal-#{lane.delete_prefix('sim-')}", label: location.slug.start_with?('simulation-') ? "Simulation reader #{location.slug.delete_prefix('simulation-')}" : "Simulated reader — #{location.name}")
          end
        end
      end
    end
  end
end
