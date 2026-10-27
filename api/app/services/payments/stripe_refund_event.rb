# frozen_string_literal: true

module Payments
  # Call only after the controller has verified the signed Stripe event and its
  # account/livemode against identity. Pass individual refund objects, including
  # each object from charge.refunded's refunds collection (fetch all pages).
  class StripeRefundEvent
    def self.call(identity:, event_id:, refund:, original_references:)
      Configuration.validate_identity!(identity)
      raise BindingError, "Refund event requires Stripe identity" unless identity.provider == "stripe"
      data = refund.to_h.deep_stringify_keys
      raise BindingError, "Refund event is missing provider ID" if data["id"].blank?
      metadata = data.fetch("metadata", {})
      operation = RefundOperation.find_by(payment_identity: identity, raw_provider_id: data["id"])
      operation ||= RefundOperation.find_by(id: metadata["refund_operation_id"], payment_identity: identity) if metadata["refund_operation_id"].present?
      raise BindingError, "Refund event is uncorrelated; reconciliation required" unless operation
      # References must come from the signed refund/charge or an authenticated
      # query by the parent dispatcher, never from caller-controlled metadata.
      observed_references = [ data["payment_intent"], data["charge"] ].compact
      unless original_references.include?(operation.original_reference) &&
          (observed_references & original_references).any? && data["currency"] == operation.currency.downcase
        raise BindingError, "Refund event original charge/currency mismatch"
      end
      status = { "succeeded" => "succeeded", "failed" => "failed", "canceled" => "failed", "pending" => "pending", "requires_action" => "pending" }.fetch(data["status"], "unknown")
      ApplyPaymentEvent.call(operation: operation, event_key: "stripe:#{event_id}:#{data.fetch('id')}",
        status: status, raw_id: data.fetch("id"), amount_cents: data.fetch("amount"),
        identity_id: identity.id, original_reference: operation.original_reference)
    end
  end
end
