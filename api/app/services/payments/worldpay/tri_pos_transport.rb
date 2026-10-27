# frozen_string_literal: true

require_relative "tri_pos_configuration"

module Payments
  module Worldpay
    # Intentionally disabled seam. There is NO HTTP implementation or opt-in in
    # this slice. An assigned contract and separately reviewed bounded transport
    # are prerequisites for any real dispatch. Tests inject an in-memory callable.
    class TriPosTransport
      class Disabled < StandardError; end

      def initialize(configuration:)
        raise TriPosConfiguration::Invalid, "invalid_tripos_configuration" unless configuration.is_a?(TriPosConfiguration)
      end

      # Replacement contract: -> { status: Integer, headers: Hash, body: String }.
      # No retry, redirect, proxy, credential lookup, logging, or network fallback.
      def call(method:, path:, body:, headers:)
        raise Disabled, "tripos_network_transport_disabled", cause: nil
      end

      def inspect
        "#<#{self.class.name} disabled [REDACTED]>"
      end
      alias_method :to_s, :inspect
    end
  end
end
