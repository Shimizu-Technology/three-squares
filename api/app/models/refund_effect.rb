# frozen_string_literal: true

# Transactional refund outbox. The parent dispatcher owns delivery/retry; consumers
# must key delivery on this row's ID, and suppress external sends for simulation.
class RefundEffect < ApplicationRecord
  belongs_to :refund_operation
  attr_readonly :refund_operation_id, :kind, :payload
  scope :undelivered, -> { where(delivered_at: nil) }
end
