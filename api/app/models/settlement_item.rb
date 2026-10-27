# frozen_string_literal: true

class SettlementItem < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :settlement_batch
  belongs_to :reconciliation_import
  belongs_to :payment_transaction, optional: true
  belongs_to :refund_operation, optional: true
  belongs_to :legacy_capture_binding, optional: true
  belongs_to :location, optional: true
  attr_readonly :settlement_batch_id, :reconciliation_import_id, :payment_transaction_id, :legacy_capture_binding_id, :refund_operation_id, :location_id,
    :external_id, :facts_digest, :source_facts, :transaction_id, :original_reference, :terminal_id, :entry_type, :amount_cents, :occurred_at,
    :provider_local_time, :provider_offset, :business_date
  validate do
    errors.add(:base, "Batch identity mismatch") if settlement_batch && settlement_batch.payment_identity_id != payment_identity_id
    errors.add(:base, "Capture identity mismatch") if payment_transaction && payment_transaction.payment_identity_id != payment_identity_id
    errors.add(:base, "Legacy capture identity mismatch") if legacy_capture_binding && legacy_capture_binding.payment_identity_id != payment_identity_id
    errors.add(:base, "Refund identity mismatch") if refund_operation && refund_operation.payment_identity_id != payment_identity_id
  end
end
