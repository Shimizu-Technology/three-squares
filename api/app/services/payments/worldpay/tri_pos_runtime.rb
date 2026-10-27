# frozen_string_literal: true

module Payments
  module Worldpay
    class TriPosRuntime
      attr_reader :configuration, :client, :profile

      def initialize(identity:, profile:, env: ENV, transport: nil)
        Payments::Configuration.validate_identity!(identity)
        @profile = profile.deep_dup
        caps = @profile.fetch('capabilities')
        unless @profile['presentation'] == 'worldpay_terminal' && caps['contract_approved'] == true && caps['contract_version'] == '5.0.4' &&
            caps['application_version'] == env['WORLDPAY_EXPRESS_APPLICATION_VERSION'] && caps['usd_query_contract'] == true &&
            caps['query_completeness_approved'] == true && ActiveSupport::TimeZone[caps['reporting_time_zone']] &&
            %w[captured_statuses declined_statuses sale_types allowed_payment_types].all? { |key| caps[key].is_a?(Array) && caps[key].any? && caps[key].size <= 8 && caps[key].all? { |value| value.is_a?(String) && value.length.between?(1, 64) } } &&
            caps['request_timeout_seconds'].is_a?(Integer) && caps['request_timeout_seconds'].between?(1, 120) &&
            caps['user_input_timeout'].is_a?(String) && caps['user_input_timeout'].match?(/\A[0-9]{1,10}\z/)
          raise Payments::Configuration::UnsafeConfiguration, 'Assigned triPOS release, query, currency, device and timeout contracts are required'
        end
        @configuration = TriPosConfiguration.new(identity: identity, env: env)
        unless transport || env['WORLDPAY_TRIPOS_TRANSPORT_ENABLED'] == 'true'
          raise Payments::Configuration::UnsafeConfiguration, 'triPOS transport is not enabled'
        end
        @client = TriPosClient.new(configuration: @configuration, transport: transport || TriPosTransport.new(configuration: @configuration,
          enabled: true, total_timeout: caps.fetch('request_timeout_seconds')))
      rescue KeyError, TypeError, TriPosConfiguration::Invalid
        raise Payments::Configuration::UnsafeConfiguration, 'Original triPOS configuration is incomplete', cause: nil
      end

      def inspect = "#<#{self.class.name} [REDACTED]>"
    end
  end
end
