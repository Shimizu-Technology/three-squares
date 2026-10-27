# frozen_string_literal: true

require "net/http"
require "openssl"
require "timeout"
require_relative "configuration"

module Payments
  module Worldpay
    # Opt-in network transport. Clients NEVER construct this implicitly. Routine
    # specs do not invoke it. No retry, redirect, proxy discovery or body logging.
    class ExpressTransport
      class Error < StandardError
        attr_reader :code
        def initialize(code)
          @code = code
          super(code)
        end
      end
      class Deadline < StandardError; end

      def initialize(configuration:, open_timeout: 5, read_timeout: 10, write_timeout: 10, total_timeout: 30)
        @configuration = configuration
        @open_timeout, @read_timeout, @write_timeout, @total_timeout = [ open_timeout, read_timeout, write_timeout, total_timeout ].map do |value|
          raise Configuration::Invalid, "invalid_transport_timeout" unless value.is_a?(Numeric) && value.finite? && value.positive? && value <= 30
          value
        end
      end

      # Returns only a bounded XML String. Any error after dispatch is an unknown
      # financial outcome, including oversized bodies and non-200 HTTP responses.
      def call(interface:, body:)
        uri = @configuration.endpoint(interface)
        raise Error, "invalid_request_body" unless body.is_a?(String) && body.bytesize.between?(1, Configuration::MAX_BYTES)
        http = Net::HTTP.new(uri.host, uri.port, nil)
        http.use_ssl = true
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER
        http.verify_hostname = true
        http.min_version = OpenSSL::SSL::TLS1_2_VERSION
        http.open_timeout, http.read_timeout, http.write_timeout = @open_timeout, @read_timeout, @write_timeout
        http.max_retries = 0
        request = Net::HTTP::Post.new(uri.request_uri, "Content-Type" => "text/xml; charset=utf-8", "Accept" => "text/xml", "Accept-Encoding" => "identity")
        request.body = body
        result = +""
        Timeout.timeout(@total_timeout, Deadline) do
          http.start do |connection|
            connection.request(request) do |response|
              raise Error, "unexpected_http_status" unless response.code == "200"
              raise Error, "unexpected_content_encoding" unless [ nil, "identity" ].include?(response["Content-Encoding"])
              length = response["Content-Length"]
              if length && (!/\A[0-9]{1,10}\z/.match?(length) || length.to_i > Configuration::MAX_BYTES)
                raise Error, "response_size_limit"
              end
              response.read_body do |chunk|
                raise Error, "response_size_limit" if result.bytesize + chunk.bytesize > Configuration::MAX_BYTES
                result << chunk
              end
            end
          end
        end
        raise Error, "empty_response" if result.empty?
        result
      rescue Error, Configuration::Invalid
        raise
      rescue StandardError
        # Never retain cause/message: these may contain request data or secrets.
        raise Error.new("transport_outcome_unknown"), cause: nil
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end
    end
  end
end
