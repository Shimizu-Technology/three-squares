# frozen_string_literal: true

class PaymentOutbox < ApplicationRecord
  attr_readonly :effect_key, :kind, :payload
  validates :effect_key, :kind, presence: true
  scope :due, -> { where.not(state: 'delivered').where('next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)', Time.current, Time.current) }

  def self.record!(effect_key:, kind:, payload:)
    create_or_find_by!(effect_key: effect_key) do |row|
      row.kind = kind
      row.payload = payload
    end
  end
end
