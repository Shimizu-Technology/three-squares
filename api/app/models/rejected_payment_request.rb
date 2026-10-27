# frozen_string_literal: true

# A committed refusal proves this caller key can never start collection.
class RejectedPaymentRequest < ApplicationRecord
  attr_readonly :owner_key, :caller_idempotency_key, :payload_digest, :reason
end
