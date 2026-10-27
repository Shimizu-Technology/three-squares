# frozen_string_literal: true

module Payments
  module Worldpay
    # A return is a hint to query the original account, never payment evidence.
    # Keep capabilities, card data, and validation codes out of the return URL.
    class ReturnState
      PURPOSE = "worldpay-hosted-return-v1"
      MAX_BYTES = 4096

      def initialize(verifier: Rails.application.message_verifier(PURPOSE))
        @verifier = verifier
      end

      def issue(attempt:, operation_key:)
        @verifier.generate(binding(attempt, operation_key), purpose: PURPOSE, expires_in: 15.minutes)
      end

      def valid?(token, attempt:, operation_key:)
        return false unless token.is_a?(String) && token.bytesize.between?(1, MAX_BYTES)
        @verifier.verified(token, purpose: PURPOSE) == binding(attempt, operation_key)
      rescue ArgumentError, TypeError
        false
      end

      private

      def binding(attempt, operation_key)
        unless Configuration::GUID.match?(operation_key.to_s)
          raise Configuration::Invalid, "invalid_return_operation_key"
        end
        { "attempt" => attempt.id.to_s, "session" => attempt.checkout_session_id.to_s,
          "identity" => attempt.payment_identity_id.to_s, "snapshot" => attempt.payload_digest.to_s,
          "amount" => attempt.requested_cents, "currency" => attempt.currency, "operation" => operation_key }
      end
    end
  end
end
