# frozen_string_literal: true

class FundingAllocation < ApplicationRecord
  include ReconciliationBoundRecord
  belongs_to :settlement_batch
  belongs_to :funding_deposit
  belongs_to :reconciliation_import, optional: true
  belongs_to :user
  attr_readonly :settlement_batch_id, :funding_deposit_id, :reconciliation_import_id, :user_id, :external_id, :facts_digest, :source_facts, :reason, :amount_cents
  validates :reason, length: { in: 1..240 }
  validate do
    if [ settlement_batch, funding_deposit ].compact.any? { |record| record.payment_identity_id != payment_identity_id }
      errors.add(:base, "Allocation cannot cross payment identities")
    end
  end
end
