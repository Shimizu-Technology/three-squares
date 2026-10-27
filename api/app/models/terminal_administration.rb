# frozen_string_literal: true

class TerminalAdministration < ApplicationRecord
  belongs_to :payment_identity
  belongs_to :payment_profile
  belongs_to :location
  belongs_to :payment_terminal, optional: true
  belongs_to :user
  attr_readonly :payment_identity_id, :payment_profile_id, :location_id, :user_id, :lane_id,
    :terminal_reference, :label, :operation_key, :payload_digest, :kind
  validates :state, inclusion: {in: %w[reserved dispatching unknown succeeded failed]}
  validates :kind, inclusion: {in: %w[pair update retire]}
  scope :active, -> { where(state: %w[reserved dispatching unknown]) }
end
