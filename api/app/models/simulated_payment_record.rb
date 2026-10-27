# Local processor evidence. A prefix is never payment authority.
class SimulatedPaymentRecord < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :payment_attempt, optional: true
  attr_readonly :payment_identity_id, :payment_attempt_id, :kind, :operation_key, :payload_digest, :raw_id, :amount_cents, :original_reference
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validate { errors.add(:payment_identity, 'must be simulated') unless payment_identity&.environment == 'simulated' }
end
