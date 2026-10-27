# frozen_string_literal: true

class PaymentTransaction < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :payment_attempt
  belongs_to :order, optional: true
  attr_readonly :payment_identity_id, :payment_attempt_id, :provider, :raw_provider_id, :reference, :currency, :amount_cents
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validate do
    next unless payment_identity && payment_attempt
    errors.add(:base, "Transaction binding mismatch") unless
      provider == payment_identity.provider && reference == payment_identity.canonical_reference(raw_provider_id) &&
      payment_attempt.payment_identity_id == payment_identity_id && currency == payment_attempt.currency
  end
end
