# frozen_string_literal: true

class RefundOperation < ApplicationRecord
  STATES = %w[reserved dispatching pending unknown succeeded failed].freeze
  HOLDING_STATES = %w[reserved dispatching pending unknown succeeded].freeze
  belongs_to :order
  belongs_to :payment_identity, optional: true
  belongs_to :payment_attempt, optional: true
  belongs_to :original_charge, class_name: "PaymentTransaction", optional: true
  belongs_to :user, optional: true
  has_one :refund, dependent: :restrict_with_exception
  has_many :refund_observations, dependent: :restrict_with_exception
  has_many :refund_effects, dependent: :restrict_with_exception
  attr_readonly :order_id, :payment_identity_id, :payment_attempt_id, :original_charge_id,
    :operation_key, :reference_number, :caller_idempotency_key, :payload_digest, :original_reference,
    :provider, :environment, :currency, :kind, :amount_cents, :captured_cents, :reason, :user_id,
    :metadata, :restoration_request
  before_validation(on: :create) { self.reference_number ||= PaymentOperationNumber.create!.id }
  validates :state, inclusion: { in: STATES }
  validates :kind, inclusion: { in: %w[return void reversal] }
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :caller_idempotency_key, :payload_digest, :original_reference, presence: true
  scope :holding, -> { where(state: HOLDING_STATES) }
end
