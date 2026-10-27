# frozen_string_literal: true

require "uri"

module Payments
  module Worldpay
    # Pure configuration port: no Rails boot, secret discovery, or network I/O.
    class Configuration
      class Invalid < ArgumentError; end

      MAX_BYTES = 65_536
      GUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      HOSTS = {
        "sandbox" => { transaction: "certtransaction.elementexpress.com", reporting: "certreporting.elementexpress.com", services: "certservices.elementexpress.com" },
        "production" => { transaction: "transaction.elementexpress.com", reporting: "reporting.elementexpress.com", services: "services.elementexpress.com" }
      }.freeze
      CREDENTIAL_ENV = {
        "AccountID" => "WORLDPAY_EXPRESS_ACCOUNT_ID", "AccountToken" => "WORLDPAY_EXPRESS_ACCOUNT_TOKEN", "AcceptorID" => "WORLDPAY_EXPRESS_ACCEPTOR_ID",
        "ApplicationID" => "WORLDPAY_EXPRESS_APPLICATION_ID", "ApplicationName" => "WORLDPAY_EXPRESS_APPLICATION_NAME", "ApplicationVersion" => "WORLDPAY_EXPRESS_APPLICATION_VERSION"
      }.freeze

      attr_reader :environment, :identity_key, :terminal_profile, :return_url, :token_scheme

      # namespaces and terminal_profile are deliberately REQUIRED onboarding
      # inputs. The local spec does not supply an approved XSD or terminal values.
      def initialize(identity:, terminal_profile:, namespaces:, return_origins:, env: ENV, credentials: nil,
                     premium_origins: [], token_scheme: nil)
        production = env["APP_DEPLOYMENT_ENV"] == "production" || (defined?(Rails) && Rails.env.production?)
        @environment = identity.environment.to_s.dup.freeze
        unless identity.provider == "worldpay" && HOSTS.key?(environment) && identity.currency == "USD" &&
            identity.credential_reference == "worldpay_default" && env["WORLDPAY_MODE"] == environment &&
            (production ? environment == "production" && env["APP_DEPLOYMENT_ENV"] == "production" : environment == "sandbox") &&
            %w[development test staging production].include?(env["APP_DEPLOYMENT_ENV"]) &&
            (!production || (env["APP_MODE"] == "production" && env["PAYMENTS_SIMULATION_ENABLED"] != "true"))
          raise Invalid, "invalid_worldpay_identity_environment"
        end
        @credentials = CREDENTIAL_ENV.to_h { |field, name| [ field, scalar!((credentials || {}).fetch(field) { credentials ? nil : env[name] }) ] }.freeze
        if credentials && (!credentials.is_a?(Hash) || (credentials.keys - CREDENTIAL_ENV.keys).any?)
          raise Invalid, "invalid_credentials"
        end
        raise Invalid, "account_identity_mismatch" unless @credentials.fetch("AccountID") == identity.external_account_id
        @identity_key = [ "worldpay", environment, scalar!(identity.external_account_id) ].freeze
        @endpoints = HOSTS.fetch(environment).to_h do |interface, _|
          [ interface, validate_endpoint!(interface, env["WORLDPAY_EXPRESS_#{interface.to_s.upcase}_URL"]).to_s.freeze ]
        end.freeze
        @namespaces = HOSTS.fetch(environment).keys.to_h { |interface| [ interface, scalar!(namespaces.fetch(interface), limit: 256) ] }.freeze
        @return_origins = origins!(return_origins)
        @premium_origins = origins!(premium_origins)
        @return_url = allowed_url!(env["WORLDPAY_RETURN_URL"], @return_origins).to_s.freeze
        @hosted_base = validate_hosted_base!(env["WORLDPAY_EXPRESS_HOSTED_BASE_URL"]).to_s.freeze
        unless terminal_profile.is_a?(Hash) && terminal_profile[:approved] == true &&
            scalar!(terminal_profile[:key]) == scalar!(env["WORLDPAY_TERMINAL_PROFILE_KEY"]) &&
            terminal_profile[:fields].is_a?(Hash) && !terminal_profile[:fields].empty?
          raise Invalid, "approved_terminal_profile_required"
        end
        # The contract's required_profile_paths (XmlBuilder) determines exactly
        # which indicators are required. No numeric indicator defaults exist here.
        @terminal_profile = terminal_profile[:fields].to_h do |section, fields|
          raise Invalid, "invalid_terminal_profile" unless %w[Terminal Transaction].include?(section) && fields.is_a?(Hash) && !fields.empty?
          [ section.dup.freeze, fields.to_h { |name, value| [ scalar!(name), scalar!(value) ] }.freeze ]
        end.freeze
        raise Invalid, "invalid_token_scheme" unless token_scheme.nil? || %w[pass omni_token].include?(token_scheme)
        @token_scheme = token_scheme&.dup&.freeze
        freeze
      rescue KeyError, TypeError, NoMethodError
        raise Invalid, "incomplete_worldpay_configuration", cause: nil
      end

      def credentials
        @credentials.slice("AccountID", "AccountToken", "AcceptorID")
      end

      def application
        @credentials.slice("ApplicationID", "ApplicationName", "ApplicationVersion")
      end

      def namespace(interface)
        @namespaces.fetch(interface)
      end

      def endpoint(interface)
        validate_endpoint!(interface, @endpoints.fetch(interface))
      rescue KeyError
        raise Invalid, "invalid_interface", cause: nil
      end

      def validate_endpoint!(interface, value)
        uri = https!(value)
        unless HOSTS.fetch(environment).fetch(interface) == uri.host && uri.path == "/" && !uri.query
          raise Invalid, "invalid_express_endpoint"
        end
        uri
      rescue KeyError
        raise Invalid, "invalid_interface", cause: nil
      end

      def hosted_url(setup_id)
        raise Invalid, "invalid_setup_id" unless setup_id.is_a?(String) && GUID.match?(setup_id)
        "#{@hosted_base}?#{URI.encode_www_form(TransactionSetupID: setup_id)}"
      end

      def premium_url(value)
        allowed_url!(value, @premium_origins).to_s
      end

      def secrets_in?(value)
        case value
        when Hash then value.any? { |key, entry| secrets_in?(key) || secrets_in?(entry) }
        when Array then value.any? { |entry| secrets_in?(entry) }
        when String, Symbol then credentials.values.any? { |secret| value.to_s.include?(secret) }
        else false
        end
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end

      private

      def scalar!(value, limit: 256)
        text = value.dup.force_encoding(Encoding::UTF_8) if value.is_a?(String)
        unless text && text.bytesize.between?(1, limit) && text.valid_encoding? &&
            text == text.strip && !text.match?(/[[:cntrl:]]/)
          raise Invalid, "invalid_configuration_field"
        end
        text.freeze
      end

      def https!(value)
        scalar!(value, limit: 2048)
        uri = URI.parse(value)
        unless uri.is_a?(URI::HTTPS) && uri.host && uri.port == 443 && !uri.userinfo && !uri.fragment
          raise Invalid, "invalid_https_url"
        end
        uri
      rescue URI::InvalidURIError
        raise Invalid, "invalid_https_url", cause: nil
      end

      def origins!(values)
        raise Invalid, "invalid_origin_allowlist" unless values.is_a?(Array) && values.length <= 20
        values.map do |value|
          uri = https!(value)
          raise Invalid, "invalid_origin_allowlist" unless [ "", "/" ].include?(uri.path) && !uri.query
          "https://#{uri.host}".freeze
        end.freeze
      end

      def allowed_url!(value, origins)
        uri = https!(value)
        raise Invalid, "url_origin_not_allowed" unless origins.include?("https://#{uri.host}")
        uri
      end

      def validate_hosted_base!(value)
        uri = https!(value)
        host = environment == "sandbox" ? "certtransaction.hostedpayments.com" : "transaction.hostedpayments.com"
        raise Invalid, "invalid_hosted_base" unless uri.host == host && uri.path == "/" && !uri.query
        uri
      end
    end
  end
end
