class PaymentTerminal < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :location
  belongs_to :leased_attempt, class_name: 'PaymentAttempt', optional: true
  attr_readonly :payment_identity_id, :location_id, :lane_id, :terminal_id
  validates :label, :lane_id, :terminal_id, presence: true
  validates :status, inclusion: {in: %w[ready waiting_for_card card_inserted processing offline retired]}

  def reserve!(attempt)
    Payments::Configuration.validate_identity!(payment_identity)
    with_lock do
      release_resolved!
      if leased_attempt_id && leased_attempt_id != attempt.id
        raise Payments::Conflict, "Reader in use for #{leased_attempt.order.order_number}. Check that payment before retrying."
      end
      unless !retired_at && status != 'offline' && attempt.payment_identity_id == payment_identity_id && attempt.order.location_id == location_id && attempt.checkout_session.channel == 'pos'
        raise Payments::BindingError, 'Reader is unavailable for this payment location/account'
      end
      # An elapsed lease is never evidence of no charge.
      update!(leased_attempt: attempt, leased_at: leased_at || Time.current, status: 'waiting_for_card')
    end
  end

  def release_resolved!
    if leased_attempt_id && %w[captured failed cancelled compensated].include?(leased_attempt.reload.state)
      update!(leased_attempt: nil, leased_at: nil, status: %w[offline retired].include?(status) ? status : 'ready')
    end
  end
end
