# frozen_string_literal: true

require "securerandom"

module Payments
  module Worldpay
    # Credential-bound configuration only; constructing it never performs I/O.
    class TriPosConfiguration
      class Invalid < ArgumentError; end

      GUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      ORIGINS = { "sandbox" => "https://triposcert.vantiv.com", "production" => "https://tripos.vantiv.com" }.freeze
      HEADER_ENV = {
        "tp-application-id" => "WORLDPAY_EXPRESS_APPLICATION_ID",
        "tp-application-name" => "WORLDPAY_EXPRESS_APPLICATION_NAME",
        "tp-application-version" => "WORLDPAY_EXPRESS_APPLICATION_VERSION",
        "tp-express-account-id" => "WORLDPAY_EXPRESS_ACCOUNT_ID",
        "tp-express-acceptor-id" => "WORLDPAY_EXPRESS_ACCEPTOR_ID",
        "tp-express-account-token" => "WORLDPAY_EXPRESS_ACCOUNT_TOKEN"
      }.freeze

      attr_reader :environment, :identity_id, :endpoint

      def initialize(identity:, env: ENV)
        @environment = scalar!(identity.environment)
        deployment = env["APP_DEPLOYMENT_ENV"]
        unless identity.provider == "worldpay" && ORIGINS.key?(environment) &&
            identity.credential_reference == "worldpay_default" && env["WORLDPAY_MODE"] == environment &&
            env["PAYMENTS_SIMULATION_ENABLED"] != "true" &&
            (environment == "production" ? deployment == "production" && env["APP_MODE"] == "production" : %w[development test staging].include?(deployment))
          raise Invalid, "invalid_tripos_identity_environment"
        end
        @identity_id = identity.id
        unless (@identity_id.is_a?(Integer) && @identity_id.positive?) || (@identity_id.is_a?(String) && GUID.match?(@identity_id))
          raise Invalid, "invalid_tripos_identity"
        end
        @identity_id = @identity_id.dup.freeze if @identity_id.is_a?(String)
        @headers = HEADER_ENV.to_h { |header, name| [ header, scalar!(env[name]) ] }.freeze
        unless @headers.fetch("tp-express-account-id") == scalar!(identity.external_account_id) &&
            @headers.fetch("tp-express-acceptor-id") == scalar!(identity.external_acceptor_id)
          raise Invalid, "tripos_identity_binding_mismatch"
        end
        @endpoint = ORIGINS.fetch(environment).dup.freeze
        origin = env.fetch("WORLDPAY_TRIPOS_ORIGIN", endpoint)
        raise Invalid, "invalid_tripos_origin" unless [ endpoint, "#{endpoint}/" ].include?(origin)
        freeze
      rescue KeyError, TypeError, NoMethodError
        raise Invalid, "incomplete_tripos_configuration", cause: nil
      end

      # Client generates a fresh UUID for EVERY dispatch, including queries/lanes.
      # A request ID is correlation, never an idempotency or retry guarantee.
      def headers(request_id:, lane_api: false)
        unless request_id.is_a?(String) && GUID.match?(request_id) && [ true, false ].include?(lane_api)
          raise Invalid, "invalid_tripos_request_headers"
        end
        result = @headers.merge("tp-request-id" => request_id.dup.freeze,
          "Accept" => "application/json", "Content-Type" => "application/json")
        result["tp-authorization"] = "Version=2.0" unless lane_api
        result.freeze
      end

      # Only used to prevent credential reflection into sanitized observations.
      def token_in?(value)
        case value
        when Hash then value.any? { |key, item| token_in?(key) || token_in?(item) }
        when Array then value.any? { |item| token_in?(item) }
        when String then value.include?(@headers.fetch("tp-express-account-token"))
        else false
        end
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end
      alias_method :to_s, :inspect

      private

      def scalar!(value)
        text = value.dup.force_encoding(Encoding::UTF_8) if value.is_a?(String)
        unless text && text.valid_encoding? && text.bytesize.between?(1, 256) && text == text.strip && !text.match?(/[[:cntrl:]]/)
          raise Invalid, "invalid_tripos_configuration_field"
        end
        text.freeze
      end
    end
  end
end
