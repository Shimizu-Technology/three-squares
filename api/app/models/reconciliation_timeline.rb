# frozen_string_literal: true

# Accounting simulation time is independent of every payment attempt clock.
class ReconciliationTimeline < ApplicationRecord
  belongs_to :payment_identity
  attr_readonly :payment_identity_id
  validate { errors.add(:payment_identity, "must be simulated") unless payment_identity&.environment == "simulated" }
end
