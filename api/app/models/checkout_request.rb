# frozen_string_literal: true

class CheckoutRequest < ApplicationRecord
  belongs_to :checkout_session, optional: true
  attr_readonly :owner_key, :caller_idempotency_key, :request_digest
  validates :outcome, inclusion: { in: %w[resolving accepted rejected] }
  validates :owner_key, :caller_idempotency_key, :request_digest, presence: true
  validate do
    errors.add(:outcome, "is already decided") if persisted? && %w[accepted rejected].include?(outcome_in_database) && changed?
    if outcome == "accepted" && (!checkout_session || checkout_session.owner_key != owner_key ||
        checkout_session.caller_idempotency_key != caller_idempotency_key || checkout_session.snapshot["request_digest"] != request_digest)
      errors.add(:checkout_session, "does not match the original request")
    end
  end
end
