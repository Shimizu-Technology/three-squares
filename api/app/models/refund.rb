# frozen_string_literal: true

class Refund < ApplicationRecord
  belongs_to :order
  belongs_to :user, optional: true  # admin who processed it

  validates :amount_cents, presence: true, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: %w[pending succeeded failed] }
  validates :payment_provider, inclusion: { in: %w[stripe worldpay paypal test] }, allow_nil: true
  validates :stripe_refund_id, uniqueness: true, allow_nil: true
  validates :provider_refund_id, uniqueness: true, allow_nil: true

  scope :succeeded, -> { where(status: "succeeded") }
  scope :pending, -> { where(status: "pending") }
  scope :failed, -> { where(status: "failed") }
  scope :recent, -> { order(created_at: :desc) }

  def amount_dollars
    amount_cents / 100.0
  end

  def succeeded?
    status == "succeeded"
  end

  def pending?
    status == "pending"
  end

  def failed?
    status == "failed"
  end
end
