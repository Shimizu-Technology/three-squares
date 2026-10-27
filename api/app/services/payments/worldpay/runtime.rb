# frozen_string_literal: true

module Payments
  module Worldpay
    # Server-owned composition. No defaults infer an assigned merchant profile.
    class Runtime
      attr_reader :configuration, :client, :profile

      def initialize(attempt:, env: ENV, transport: nil, return_state: ReturnState.new)
        @profile = ProfileSnapshot.for_attempt(attempt)
        @configuration = self.class.configuration_for(identity: attempt.payment_identity, profile: profile, env: env,
          return_query: -> { { attempt_id: attempt.id, state: return_state.issue(attempt: attempt, operation_key: attempt.operation_key) } })
        unless transport || env["WORLDPAY_TRANSPORT_ENABLED"] == "true"
          raise Payments::Configuration::UnsafeConfiguration, "Worldpay transport is not enabled"
        end
        @client = ExpressClient.new(configuration: configuration, transport: transport || ExpressTransport.new(configuration: configuration),
          wire_contract: PublishedContract.wire_contract, setup_contract: PublishedContract.setup_contract,
          report_contract: PublishedContract.report_contract, pagination_request: PublishedContract.pagination_request,
          observation_contracts: PublishedContract.observation_contracts)
      rescue Configuration::Invalid, KeyError, TypeError, URI::InvalidURIError
        raise Payments::Configuration::UnsafeConfiguration, "Original Worldpay configuration is incomplete", cause: nil
      end

      # Shared, local-only preflight for assigned profiles. No attempt, signing,
      # client or transport is created by the read-only settings check.
      def self.preflight_profile!(identity:, profile:, env: ENV)
        configuration = configuration_for(identity: identity, profile: profile, env: env)
        validate_collection_contracts!(profile)
        HostedCheckout.preflight_fields!(configuration: configuration, profile: profile,
          reference: "configuration-check", amount_cents: 100, operation_key: "00000000-0000-4000-8000-000000000001")
      end

      def self.validate_collection_contracts!(profile)
        caps = profile.fetch("capabilities")
        unless caps["usd_query_contract"] == true && caps["fraud_policy"] == "processor_enforced" && ActiveSupport::TimeZone[caps["reporting_time_zone"]]
          raise Payments::Configuration::UnsafeConfiguration, "Assigned USD, fraud and reporting contracts are required"
        end
      end

      def self.configuration_for(identity:, profile:, env: ENV, return_query: nil)
        capabilities = profile.fetch("capabilities")
        unless profile["presentation"] == "worldpay_hosted_page" && capabilities["hosted_page_variant"] == "legacy"
          raise Payments::UnsupportedCapability, "Worldpay Hosted Fields/Premium contract is awaiting onboarding"
        end
        unless capabilities["application_version"] == env["WORLDPAY_EXPRESS_APPLICATION_VERSION"]
          raise Payments::Configuration::UnsafeConfiguration, "Original Worldpay release profile is unavailable"
        end
        terminal = capabilities.fetch("terminal_profile")
        url = URI.parse(env.fetch("WORLDPAY_RETURN_URL"))
        unless url.query.nil? && url.path == "/api/v1/payments/worldpay/return"
          raise Configuration::Invalid, "fixed_hosted_return_path_required"
        end
        url.query = URI.encode_www_form(return_query.call) if return_query
        Configuration.new(identity: identity,
          terminal_profile: { approved: terminal["approved"], key: terminal["key"], fields: terminal["fields"] },
          namespaces: PublishedContract.namespaces, return_origins: capabilities.fetch("return_origins"),
          premium_origins: capabilities.fetch("premium_origins", []), env: env.to_h.merge("WORLDPAY_RETURN_URL" => url.to_s))
      rescue Configuration::Invalid, KeyError, TypeError, URI::InvalidURIError
        raise Payments::Configuration::UnsafeConfiguration, "Original Worldpay configuration is incomplete", cause: nil
      end
    end
  end
end
