# frozen_string_literal: true

module Payments
  # Consumes already authenticated, identity-bound refund observations. The caller
  # verifies webhook signatures/account/livemode and original charge references.
  class ApplyPaymentEvent
    def self.call(operation:, event_key:, status:, amount_cents:, identity_id:, original_reference:, raw_id: nil, receipt: {})
      raise BindingError, "Refund event key is missing" if event_key.blank?
      raise BindingError, "Invalid refund event state" unless %w[pending unknown succeeded failed].include?(status)
      receipt = ReceiptFacts.project(receipt)
      facts = { status: status, amount_cents: amount_cents, identity_id: identity_id,
        original_reference: original_reference, raw_id: raw_id }
      digest = Digest::SHA256.hexdigest(facts.to_json)
      ReserveRefund.with_locks(operation.order_id) do |order, _attempt, _charge|
        operation = RefundOperation.lock.find(operation.id)
        unless operation.payment_identity_id == identity_id && operation.original_reference == original_reference &&
            amount_cents.is_a?(Integer) && operation.amount_cents == amount_cents
          raise BindingError, "Refund observation does not match original operation"
        end
        ReserveRefund.validate_authority!(operation)
        if raw_id.present? && operation.raw_provider_id.present? && raw_id != operation.raw_provider_id
          raise BindingError, "Refund provider ID cannot change"
        end
        if status == "succeeded" && operation.provider != "cash" && raw_id.blank? && operation.raw_provider_id.blank?
          raise BindingError, "Confirmed refund requires provider evidence"
        end
        existing = operation.refund_observations.find_by(event_key: event_key)
        if existing
          raise Conflict, "Refund event key reused with different facts" unless existing.payload_digest == digest
          next operation
        end
        if raw_id.present? && operation.payment_identity_id &&
            RefundOperation.where(payment_identity_id: identity_id, raw_provider_id: raw_id).where.not(id: operation.id).exists?
          raise BindingError, "Provider refund ID is already assigned to another operation"
        end
        operation.refund_observations.create!(event_key: event_key, payload_digest: digest, observed_state: status, facts: receipt)
        # A successful observation is irreversible. Failed is definitive until a
        # confirmed success corrects it; stale pending/unknown cannot reopen it.
        next_state = if operation.state == "succeeded" || status == "succeeded"
          "succeeded"
        elsif operation.state == "failed"
          "failed"
        else
          status
        end
        operation.update!(state: next_state, raw_provider_id: operation.raw_provider_id.presence || raw_id,
          succeeded_at: operation.succeeded_at || (Time.current if next_state == "succeeded"))
        refund = operation.refund
        operation.update!(next_recovery_at: nil, last_error: nil) if %w[succeeded failed].include?(next_state)
        refund.update!(status: next_state,
          stripe_refund_id: operation.provider == "stripe" ? operation.raw_provider_id : nil)
        if next_state == "succeeded"
          order.update!(payment_status: "refunded") if order.refunds.succeeded.sum(:amount_cents) >= operation.captured_cents
          if operation.restoration_request['restock_items'].present? && operation.restoration_request['restock_items'] != false
            operation.refund_effects.find_or_create_by!(kind: 'refund_inventory') do |effect|
              effect.payload = { refund_id: refund.id, order_id: order.id }
            end
          end
          operation.refund_effects.find_or_create_by!(kind: "refund_notification") do |effect|
            effect.payload = { refund_id: refund.id, order_id: order.id, environment: operation.environment }
          end
        end
        operation
      end
    end
  end
end
