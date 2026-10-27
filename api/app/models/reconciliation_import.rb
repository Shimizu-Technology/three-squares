# frozen_string_literal: true

class ReconciliationImport < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :user
  attr_readonly :user_id, :operation_key, :payload_digest, :request_digest, :schema_version, :source, :source_parameters
  validates :state, inclusion: { in: %w[processing succeeded conflicted] }
end
