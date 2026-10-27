# frozen_string_literal: true

class PaymentProfile < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :location, optional: true
  validates :provider, inclusion: { in: %w[stripe worldpay] }
  validate { errors.add(:provider, "does not match identity") if payment_identity && provider != payment_identity.provider }
  validates :channel, inclusion: { in: %w[online pos] }
  validates :presentation, inclusion: { in: %w[stripe_embedded stripe_terminal worldpay_hosted_fields worldpay_hosted_page worldpay_terminal] }
  validate do
    Payments::Configuration.validate_identity!(payment_identity) if enabled? && payment_identity
  rescue Payments::Configuration::UnsafeConfiguration => e
    errors.add(:payment_identity, e.message)
  end
end
