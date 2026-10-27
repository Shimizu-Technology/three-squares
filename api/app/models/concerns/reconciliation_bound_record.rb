# frozen_string_literal: true

module ReconciliationBoundRecord
  extend ActiveSupport::Concern
  included do
    belongs_to :payment_identity
    before_validation :stamp_reconciliation_identity, on: :create
    attr_readonly :payment_identity_id, :provider, :environment, :external_account_id, :currency
    validate :reconciliation_identity_matches
  end

  private

  def stamp_reconciliation_identity
    return unless payment_identity
    %w[provider environment external_account_id currency].each { |key| self[key] ||= payment_identity.public_send(key) }
  end

  def reconciliation_identity_matches
    return unless payment_identity
    unless %w[provider environment external_account_id currency].all? { |key| self[key] == payment_identity.public_send(key) }
      errors.add(:base, "Accounting observation does not match its original payment identity")
    end
    %i[reconciliation_import settlement_batch funding_deposit payment_transaction refund_operation legacy_capture_binding].each do |name|
      next unless respond_to?(name)
      record = public_send(name)
      errors.add(:base, "Accounting relation crosses payment identities") if record && record.payment_identity_id != payment_identity_id
    end
  end
end
