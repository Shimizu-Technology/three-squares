# frozen_string_literal: true

class PaymentOutbox < ApplicationRecord
  attr_readonly :effect_key, :kind, :payload
  validates :effect_key, :kind, presence: true
  scope :due, -> { where(state: %w[pending dispatching]).where('next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)', Time.current, Time.current) }

  # Failed notifications stop competing with financial recovery after ten tries.
  # Financial effects keep their claims and retry with a bounded query cadence.
  def retry_delivery!(error, token: nil)
    with_lock do
      return if token && lease_token != token
      attempts = [retry_count, 1].max
      notification = kind != 'compensate' && kind != 'cart_cleanup'
      update!(state: notification && attempts >= 10 ? 'manual_review_required' : 'pending',
        lease_token: nil, lease_until: nil, next_attempt_at: [2**[attempts, 11].min * 30, 3600].min.seconds.from_now,
        last_error: error.class.name)
    end
  end

  def self.record!(effect_key:, kind:, payload:)
    create_or_find_by!(effect_key: effect_key) do |row|
      row.kind = kind
      row.payload = payload
    end
  end
end
