# frozen_string_literal: true

class CheckoutSession < ApplicationRecord
  belongs_to :order
  belongs_to :user, optional: true
  belongs_to :location, optional: true
  belongs_to :payment_identity
  has_many :payment_attempts, dependent: :restrict_with_exception
  attr_readonly :order_id, :user_id, :location_id, :payment_identity_id, :channel, :snapshot, :snapshot_digest,
    :owner_key, :guest_capability_digest, :caller_idempotency_key, :amount_cents, :currency
  validates :owner_key, :caller_idempotency_key, :snapshot_digest, :expires_at, presence: true
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :currency, inclusion: { in: ["USD"] }

  def self.digest(value)
    Digest::SHA256.hexdigest(value.to_s)
  end

  def authorized?(user:, capability: nil)
    return user&.id == user_id if user_id
    capability.present? && expires_at.future? && ActiveSupport::SecurityUtils.secure_compare(guest_capability_digest, self.class.digest(capability))
  end
end
