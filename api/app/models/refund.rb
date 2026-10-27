# frozen_string_literal: true

class Refund < ApplicationRecord
  belongs_to :refund_operation, optional: true
  belongs_to :order
  belongs_to :user, optional: true  # admin who processed it

  validates :amount_cents, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :status, inclusion: { in: %w[pending unknown succeeded failed] }

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
