# frozen_string_literal: true

class ReconciliationException < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :reconciliation_import, optional: true
  belongs_to :settlement_batch, optional: true
  belongs_to :funding_deposit, optional: true
  belongs_to :reviewed_by, class_name: "User", optional: true
  attr_readonly :reconciliation_import_id, :settlement_batch_id, :funding_deposit_id, :fingerprint, :category, :facts
  validates :state, inclusion: { in: %w[open reviewed] }
end
