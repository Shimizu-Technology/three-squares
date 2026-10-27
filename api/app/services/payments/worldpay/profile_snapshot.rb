# frozen_string_literal: true

module Payments
  module Worldpay
    # Only non-secret, assigned settings belong in the immutable order intent.
    # Credential material stays in the original identity's server-side slot.
    module ProfileSnapshot
      KEYS = %w[hosted_page_variant return_origins premium_origins reporting_time_zone application_version usd_query_contract fraud_policy].freeze
      TERMINAL_FIELDS = %w[TerminalID LaneNumber CardholderPresentCode CardInputCode TerminalCapabilityCode TerminalEnvironmentCode CardPresentCode MotoECICode CVVPresenceCode TerminalType].freeze
      SETUP_FIELDS = %w[TransactionSetupMethod Embedded CVVRequired AutoReturn].freeze

      def self.capture(profile)
        capabilities = profile.capabilities.slice(*KEYS)
        terminal = profile.capabilities.fetch("terminal_profile", {})
        capabilities["terminal_profile"] = terminal.slice("approved", "key").merge("fields" => {
          "Terminal" => terminal.fetch("fields", {}).fetch("Terminal", {}).slice(*TERMINAL_FIELDS),
          "Transaction" => terminal.fetch("fields", {}).fetch("Transaction", {}).slice("MarketCode", "PartialApprovedFlag")
        })
        capabilities["setup_fields"] = profile.capabilities.fetch("setup_fields", {}).slice(*SETUP_FIELDS)
        { "version" => 1, "id" => profile.id, "presentation" => profile.presentation,
          "capabilities" => capabilities.deep_dup }
      rescue NoMethodError, TypeError
        raise Payments::Configuration::UnsafeConfiguration, "Worldpay profile fields are invalid", cause: nil
      end

      def self.for_attempt(attempt)
        Payments::Snapshot.validate!(session: attempt.checkout_session, attempt: attempt, order: attempt.order, current: false)
        profile = attempt.snapshot["payment_profile"]
        unless profile.is_a?(Hash) && profile["version"] == 1 && profile["capabilities"].is_a?(Hash)
          raise Payments::Configuration::UnsafeConfiguration, "Original Worldpay profile is unavailable"
        end
        profile.deep_dup
      end
    end
  end
end
