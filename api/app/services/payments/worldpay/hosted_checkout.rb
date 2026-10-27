# frozen_string_literal: true

require "digest"

module Payments
  module Worldpay
    class HostedCheckout
      def initialize(runtime:)
        @runtime = runtime
      end

      def setup(attempt:)
        fields = fields_for(attempt)
        # This record survives response loss. It intentionally forbids a second
        # setup request while the native idempotency contract is unconfirmed.
        attempt.with_lock do
          raise Payments::UnsupportedCapability, "Saved hosted setup requires query recovery" if attempt.provider_metadata["worldpay_setup"]
          attempt.update!(provider_metadata: attempt.provider_metadata.merge("worldpay_setup" => {
            "method" => "TransactionSetup", "operation_key" => attempt.operation_key,
            "payload_digest" => Payments::Snapshot.digest(fields.merge("amount_cents" => attempt.requested_cents,
              "profile" => @runtime.profile, "return_url" => @runtime.configuration.return_url)), "dispatched_at" => Time.current.iso8601(6)
          }))
        end
        response = @runtime.client.transaction_setup(fields: fields, amount_cents: attempt.requested_cents,
          idempotency_key: attempt.operation_key, presentation: "legacy")
        unless response.status == "ready"
          raise Payments::UnsupportedCapability, "Hosted setup outcome is unknown; check the saved payment"
        end
        { raw_id: nil, setup_id: response.setup_id, hosted_url: response.hosted_url, flow: "worldpay_hosted_page",
          provider_metadata: { "worldpay_validation_digest" => Digest::SHA256.hexdigest(response.validation_code) } }
      end

      def preflight(attempt:)
        XmlBuilder.new(configuration: @runtime.configuration, contract: PublishedContract.wire_contract).build(
          method: "TransactionSetup", fields: fields_for(attempt), amount_cents: attempt.requested_cents, idempotency_key: attempt.operation_key)
        true
      rescue Configuration::Invalid, KeyError
        raise Payments::Configuration::UnsafeConfiguration, "Assigned hosted setup fields are incomplete", cause: nil
      end

      def fields_for(attempt)
        { "Transaction" => { "ReferenceNumber" => attempt.reference_number.to_s, "TicketNumber" => attempt.reference_number.to_s },
          "TransactionSetup" => @runtime.profile.fetch("capabilities").fetch("setup_fields") }
      end

      def self.valid_return?(attempt:, token:, validation_code:, setup_id:, return_state: ReturnState.new)
        digest = attempt.provider_metadata["worldpay_validation_digest"]
        return false unless digest.is_a?(String) && digest.bytesize == 64 && validation_code.is_a?(String) && validation_code.bytesize.between?(1, 256)
        return false unless attempt.setup_id.present? && setup_id == attempt.setup_id
        return false unless return_state.valid?(token, attempt: attempt, operation_key: attempt.operation_key)
        ActiveSupport::SecurityUtils.secure_compare(digest, Digest::SHA256.hexdigest(validation_code))
      end
    end
  end
end
