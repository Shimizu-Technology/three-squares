# frozen_string_literal: true

class PaymentAttempt < ApplicationRecord
  belongs_to :checkout_session
  belongs_to :order
  belongs_to :payment_identity
  belongs_to :payment_terminal, optional: true
  has_one :payment_transaction, dependent: :restrict_with_exception
  attr_readonly :checkout_session_id, :order_id, :payment_identity_id, :operation, :operation_key,
    :payload_digest, :reference_number, :requested_cents, :currency, :payment_terminal_id, :collection_mode
  before_validation(on: :create) { self.reference_number ||= PaymentOperationNumber.create!.id }
  validates :state, inclusion: { in: %w[created dispatching collecting unknown captured failed cancelled compensation_required compensating compensated reconciliation_required] }
  validates :requested_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :collection_mode, inclusion: { in: %w[hosted terminal] }
  validate :consistent_binding

  def consistent_binding
    return unless checkout_session
    errors.add(:base, "Payment binding mismatch") unless
      order_id == checkout_session.order_id && payment_identity_id == checkout_session.payment_identity_id &&
      requested_cents == checkout_session.amount_cents && currency == checkout_session.currency && payload_digest == checkout_session.snapshot_digest
  end
end
