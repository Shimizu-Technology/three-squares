# frozen_string_literal: true

class FundingDeposit < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :reconciliation_import
  has_many :funding_allocations, dependent: :restrict_with_exception
  attr_readonly :reconciliation_import_id, :external_id, :facts_digest, :source_facts, :deposit_date, :amount_cents
end
