# frozen_string_literal: true

class ReconciliationAudit < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :user
  attr_readonly :user_id, :event, :subject_type, :subject_id, :reason, :facts
  validates :reason, length: { in: 1..240 }
end
