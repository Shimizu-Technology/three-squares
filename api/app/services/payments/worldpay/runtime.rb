# frozen_string_literal: true

module Payments
  module Worldpay
    # Server-owned composition. No defaults infer an assigned merchant profile.
    class Runtime
      attr_reader :configuration, :client, :profile

      def initialize(attempt:, env: ENV, transport: nil, return_state: ReturnState.new)
        @profile = ProfileSnapshot.for_attempt(attempt)
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
        url.query = URI.encode_www_form(attempt_id: attempt.id, state: return_state.issue(attempt: attempt, operation_key: attempt.operation_key))
        @configuration = Configuration.new(identity: attempt.payment_identity,
          terminal_profile: { approved: terminal["approved"], key: terminal["key"], fields: terminal["fields"] },
          namespaces: PublishedContract.namespaces, return_origins: capabilities.fetch("return_origins"),
          premium_origins: capabilities.fetch("premium_origins", []), env: env.to_h.merge("WORLDPAY_RETURN_URL" => url.to_s))
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
    end
  end
end
