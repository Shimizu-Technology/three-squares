class PaymentTerminal < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :location
  belongs_to :payment_profile, optional: true
  belongs_to :leased_attempt, class_name: 'PaymentAttempt', optional: true
  attr_readonly :payment_identity_id, :location_id, :lane_id, :terminal_id
  validates :label, :lane_id, :terminal_id, presence: true
  validates :status, inclusion: {in: %w[ready waiting_for_card card_inserted processing offline retired]}

  def reserve!(attempt)
    raise Payments::BindingError, 'Reader does not match the saved attempt' unless attempt.payment_terminal_id == id
    Payments::AttemptLock.call(attempt) do |session, stored, _, order|
      Payments::AttemptLock.validate!(session, stored, order)
      Payments::TerminalLease.reserve_locked!(stored)
    end
  end

  def release_resolved!
    if leased_attempt_id && %w[captured failed cancelled compensated].include?(leased_attempt.reload.state)
      update!(leased_attempt: nil, leased_at: nil, command_token: nil, command_claimed_at: nil,
        status: connection_state == 'offline' || status == 'offline' ? 'offline' : (retired_at ? 'retired' : 'ready'))
    end
  end
end
