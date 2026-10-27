# frozen_string_literal: true

class PaymentIdentity < ApplicationRecord
  has_many :payment_profiles, dependent: :restrict_with_exception
  has_many :payment_attempts, dependent: :restrict_with_exception
  attr_readonly :provider, :environment, :external_account_id, :profile_key, :credential_reference, :currency
  validates :provider, inclusion: { in: %w[stripe worldpay] }
  validates :environment, inclusion: { in: %w[simulated sandbox production] }
  validates :currency, inclusion: { in: ["USD"] }
  validates :external_account_id, :profile_key, :credential_reference, presence: true
  validates :profile_key, uniqueness: true

  def canonical_reference(raw_id)
    raise ArgumentError, "Missing provider transaction" if raw_id.blank?
    "#{id}:#{raw_id}"
  end
end
