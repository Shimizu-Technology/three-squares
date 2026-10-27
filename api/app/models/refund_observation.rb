# frozen_string_literal: true

class RefundObservation < ApplicationRecord
  belongs_to :refund_operation
  attr_readonly :refund_operation_id, :event_key, :payload_digest, :observed_state, :facts
end
