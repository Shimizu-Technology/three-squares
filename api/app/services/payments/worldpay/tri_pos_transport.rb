# frozen_string_literal: true

require_relative 'tri_pos_configuration'
require 'net/http'
require 'openssl'
require 'timeout'

module Payments
  module Worldpay
    # No implicit opt-in, retry, redirect or environment-proxy discovery. Routine
    # tests inject transports; this HTTP implementation is never used by simulation.
    class TriPosTransport
      class Disabled < StandardError; end
      class Error < StandardError; end
      class Deadline < StandardError; end
      MAX_BYTES = 2 * 1024 * 1024

      def initialize(configuration:, enabled: false, total_timeout: 90)
        raise TriPosConfiguration::Invalid, 'invalid_tripos_configuration' unless configuration.is_a?(TriPosConfiguration)
        raise TriPosConfiguration::Invalid, 'invalid_tripos_transport_timeout' unless total_timeout.is_a?(Integer) && total_timeout.between?(1, 120)
        raise TriPosConfiguration::Invalid, 'invalid_tripos_transport_flag' unless [true, false].include?(enabled)
        @configuration, @enabled, @total_timeout = configuration, enabled, total_timeout
      end

      def call(method:, path:, body:, headers:)
        raise Disabled, 'tripos_network_transport_disabled', cause: nil unless @enabled
        unless %i[get post delete].include?(method) && path.is_a?(String) && path.match?(%r{\A/(?:api/v1|cloudapi/v1)/[A-Za-z0-9_/-]+\z}) &&
            (body.nil? || (body.is_a?(String) && body.bytesize.between?(1, 65_536))) && headers.is_a?(Hash)
          raise Error, 'invalid_tripos_request'
        end
        uri = URI.parse(@configuration.endpoint + path)
        http = Net::HTTP.new(uri.host, uri.port, nil)
        http.use_ssl = true
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER
        http.verify_hostname = true
        http.min_version = OpenSSL::SSL::TLS1_2_VERSION
        http.open_timeout, http.read_timeout, http.write_timeout = [5, @total_timeout].min, @total_timeout, [10, @total_timeout].min
        http.max_retries = 0
        request = {get: Net::HTTP::Get, post: Net::HTTP::Post, delete: Net::HTTP::Delete}.fetch(method).new(uri.request_uri, headers.merge('Accept-Encoding' => 'identity'))
        request.body = body if body
        result = nil
        Timeout.timeout(@total_timeout, Deadline) do
          http.start do |connection|
            connection.request(request) do |response|
              raise Error, 'unexpected_content_encoding' unless [nil, 'identity'].include?(response['Content-Encoding'])
              length = response['Content-Length']
              if length && (!length.match?(/\A[0-9]{1,10}\z/) || length.to_i > MAX_BYTES)
                raise Error, 'tripos_response_size_limit'
              end
              wire = +''
              response.read_body do |chunk|
                raise Error, 'tripos_response_size_limit' if wire.bytesize + chunk.bytesize > MAX_BYTES
                wire << chunk
              end
              response_headers = {}
              response_headers['tp-request-id'] = response['tp-request-id'] if response['tp-request-id']
              result = {status: response.code.to_i, headers: response_headers, body: wire}
            end
          end
        end
        result
      rescue Disabled, TriPosConfiguration::Invalid
        raise
      rescue StandardError
        raise Error.new('tripos_transport_outcome_unknown'), cause: nil
      end

      def inspect = "#<#{self.class.name} #{@enabled ? 'enabled' : 'disabled'} [REDACTED]>"
      alias_method :to_s, :inspect
    end
  end
end
