# frozen_string_literal: true

class SettlementBatch < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :reconciliation_import
  belongs_to :location, optional: true
  has_many :settlement_items, dependent: :restrict_with_exception
  has_many :funding_allocations, dependent: :restrict_with_exception
  attr_readonly :reconciliation_import_id, :external_id, :facts_digest, :source_facts, :terminal_id, :location_id,
    :business_date, :provider_batch_date, :closed_at, :sales_cents, :returns_cents, :fees_cents, :adjustments_cents, :amount_cents
  validates :external_id, :facts_digest, :source_facts, :business_date, :provider_batch_date, presence: true
end
