# frozen_string_literal: true

module Payments
  # Configuration observations only. Never performs provider I/O or grants
  # authority to a payment; the original attempt's runtime still validates it.
  module Status
    def self.call
      provider = SiteSetting.first&.payment_processor.presence || ENV.fetch('PAYMENTS_DEFAULT_PROVIDER', 'worldpay')
      profiles = PaymentProfile.includes(:payment_identity).where(provider: provider, enabled: true).order(:id).to_a
      locations = Location.where(active: true).order(:name, :id).to_a
      rows = [[nil, 'online']] + locations.flat_map { |location| %w[online pos].map { |channel| [location, channel] } }
      { selected_provider: provider, production_deployment: Configuration.production?,
        profiles: rows.map { |location, channel| describe(provider, profiles, location, channel) } }
    end

    def self.describe(provider, profiles, location, channel)
      profile = profiles.find { |row| row.channel == channel && row.location_id == location&.id }
      profile ||= profiles.find { |row| row.channel == channel && row.location_id.nil? }
      identity = profile&.payment_identity
      blockers = []
      gate = false
      if profile.nil?
        blockers << 'No enabled payment profile is assigned to this location and payment method.'
      else
        begin
          Configuration.validate_database!
          Configuration.validate_identity!(identity)
        rescue Configuration::UnsafeConfiguration
          blockers << 'Deployment payment safeguards are blocking this profile. An operator must review environment and profile configuration.'
        end
        if identity.environment == 'simulated'
          begin
            Simulation::Guard.validate!(identity)
          rescue Configuration::UnsafeConfiguration
            blockers << 'Simulation requires an enabled simulator flag and a dedicated non-production database.'
          end
        elsif provider == 'worldpay'
          gate = ENV[channel == 'pos' ? 'WORLDPAY_TRIPOS_TRANSPORT_ENABLED' : 'WORLDPAY_TRANSPORT_ENABLED'] == 'true'
          blockers << 'Worldpay processor dispatch is switched off in the server environment.' unless gate
          fields = Worldpay::Configuration::CREDENTIAL_ENV.values
          blockers << 'Waiting on Worldpay credentials and application configuration.' unless fields.all? { |key| ENV[key].present? }
          if ENV['WORLDPAY_EXPRESS_ACCOUNT_ID'] != identity.external_account_id || ENV['WORLDPAY_EXPRESS_ACCEPTOR_ID'] != identity.external_acceptor_id
            blockers << 'Worldpay credentials must match the original account and acceptor identity.'
          end
          if channel == 'pos'
            begin
              Worldpay::TriPosRuntime.new(identity: identity, profile: { 'presentation' => profile.presentation, 'capabilities' => profile.capabilities })
            rescue Configuration::UnsafeConfiguration
              blockers << 'Waiting on valid assigned Worldpay reader, query and timeout contracts and configuration.'
            end
          elsif profile.presentation != 'worldpay_hosted_page' || profile.capabilities['hosted_page_variant'] != 'legacy'
            blockers << 'Worldpay Hosted Fields and Premium are waiting on their assigned integration guides; legacy hosted checkout needs its own profile.'
          else
            caps = Worldpay::ProfileSnapshot.capture(profile).fetch('capabilities')
            terminal = caps.fetch('terminal_profile')
            begin
              callback = URI.parse(ENV.fetch('WORLDPAY_RETURN_URL', ''))
              unless callback.path == '/api/v1/payments/worldpay/return' && callback.query.nil? && callback.fragment.nil? &&
                  caps['application_version'] == ENV['WORLDPAY_EXPRESS_APPLICATION_VERSION'] &&
                  caps['usd_query_contract'] == true && caps['fraud_policy'] == 'processor_enforced' &&
                  ActiveSupport::TimeZone[caps['reporting_time_zone']] && Worldpay::ProfileSnapshot::SETUP_FIELDS.all? { |key| caps.fetch('setup_fields', {})[key].present? }
                raise Worldpay::Configuration::Invalid, 'assigned_profile_required'
              end
              Worldpay::Configuration.new(identity: identity, terminal_profile: { approved: terminal['approved'], key: terminal['key'], fields: terminal['fields'] },
                namespaces: Worldpay::PublishedContract.namespaces, return_origins: caps.fetch('return_origins', []))
            rescue Worldpay::Configuration::Invalid, URI::InvalidURIError, KeyError, TypeError
              blockers << 'Waiting on valid assigned Worldpay hosted-page, terminal, fraud, currency and reporting configuration.'
            end
          end
        elsif provider == 'stripe'
          begin
            StripeProvider.new(identity).request_options # Local validation only; no client/network.
            gate = true
          rescue Configuration::UnsafeConfiguration
            gate = false
          end
          blockers << 'Waiting on the original Stripe credential slot.' unless gate
          blockers << 'Stripe collection presentation does not match this payment method.' unless profile.presentation == (channel == 'pos' ? 'stripe_terminal' : 'stripe_embedded')
          blockers << 'Stripe reader location assignment is required.' if channel == 'pos' && profile.capabilities['stripe_terminal_location_id'].blank? && profile.capabilities['stripe_terminal_locations'].blank?
        end
      end
      { location_id: location&.id, location_name: location&.name || 'Online orders without a pickup location', channel: channel,
        provider: provider, profile_id: profile&.id, identity_id: identity&.id, environment: identity&.environment,
        presentation: profile&.presentation, network_gate_enabled: gate,
        real_dispatch_enabled: gate && blockers.empty? && identity&.environment != 'simulated', blockers: blockers.uniq }
    end
    private_class_method :describe
  end
end
