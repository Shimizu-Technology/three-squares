# frozen_string_literal: true

class PaymentTransaction < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :payment_attempt
  belongs_to :order, optional: true
  attr_readonly :payment_identity_id, :payment_attempt_id, :provider, :raw_provider_id, :reference, :currency, :amount_cents
  validate do
    errors.add(:order_id, "consumption cannot be reassigned") if persisted? && order_id_changed? && order_id_was.present?
  end
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validate do
    next unless payment_identity && payment_attempt
    errors.add(:base, "Transaction binding mismatch") unless
      (order_id.nil? || order_id == payment_attempt.order_id) &&
      provider == payment_identity.provider && reference == payment_identity.canonical_reference(raw_provider_id) &&
      payment_attempt.payment_identity_id == payment_identity_id && currency == payment_attempt.currency
  end
end
