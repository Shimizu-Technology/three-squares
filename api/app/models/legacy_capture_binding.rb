# frozen_string_literal: true

# A verified historical capture has one original order even without a checkout attempt.
class LegacyCaptureBinding < ApplicationRecord
  belongs_to :order
  belongs_to :payment_identity
  attr_readonly :order_id, :payment_identity_id, :provider, :environment, :external_account_id,
    :consumption_reference, :original_reference, :amount_cents, :currency, :verified_at
  validates :provider, :environment, :external_account_id, :consumption_reference, :original_reference, presence: true
end
