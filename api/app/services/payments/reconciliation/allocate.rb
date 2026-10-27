# frozen_string_literal: true

module Payments
  module Reconciliation
    class Allocate
      def self.call(**arguments)
        identity, user = arguments.values_at(:identity, :user)
        rows = bulk(identity: identity, user: user, entries: [ arguments.except(:identity, :user) ])
        rows.first
      end

      # A combined credit/debit deposit may require several signed allocations
      # together. Validate the final balances atomically, not an arbitrary row order.
      def self.bulk(identity:, user:, entries:)
        Access.check!(user: user, identity: identity)
        raise Error, "Allocation group is empty or too large" unless entries.is_a?(Array) && entries.size.between?(1, CanonicalCSV::MAX_ROWS)
        entries = entries.map(&:dup)
        FundingAllocation.transaction do
          Access.lock!(identity)
          entries.each do |entry|
            entry[:reason] = Access.reason!(entry.fetch(:reason))
            amount, key = entry.values_at(:amount_cents, :operation_key)
            unless amount.is_a?(Integer) && !amount.zero? && amount.abs <= CanonicalCSV::MAX_INTEGER && key.is_a?(String) &&
                key.match?(/\A[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,127}\z/)
              raise Error, "A stable allocation identifier and exact nonzero cents are required"
            end
            unless entry.values_at(:batch, :deposit).all? { |record| record.payment_identity_id == identity.id && record.currency == identity.currency && record.environment == identity.environment }
              raise BindingError, "Allocation cannot cross accounts, currencies or environments"
            end
          end
          batches = SettlementBatch.where(id: entries.map { |e| e[:batch].id }).order(:id).lock.index_by(&:id)
          deposits = FundingDeposit.where(id: entries.map { |e| e[:deposit].id }).order(:id).lock.index_by(&:id)
          prior = FundingAllocation.where(payment_identity: identity, external_id: entries.map { |e| e[:operation_key] }).index_by(&:external_id)
          prepared = {}
          entries.each do |entry|
            digest = Snapshot.digest(batch: entry[:batch].external_id, deposit: entry[:deposit].external_id, amount: entry[:amount_cents])
            source = entry.fetch(:source_facts, {})
            old = prior[entry[:operation_key]]
            if old
              unless old.facts_digest == digest && (old.source_facts.empty? || source.empty? || old.source_facts == source)
                raise Conflict, "Allocation identifier was reused for different facts"
              end
              next
            end
            other = prepared[entry[:operation_key]]
            if other && (other[:digest] != digest || other[:entry].fetch(:source_facts, {}) != source)
              raise Conflict, "Conflicting allocation identifiers in the same import"
            end
            prepared[entry[:operation_key]] ||= { entry: entry, digest: digest }
          end
          batch_sums = FundingAllocation.where(settlement_batch_id: batches.keys).group(:settlement_batch_id).sum(:amount_cents)
          deposit_sums = FundingAllocation.where(funding_deposit_id: deposits.keys).group(:funding_deposit_id).sum(:amount_cents)
          prepared.each_value do |value|
            entry = value[:entry]
            batch_sums[entry[:batch].id] = batch_sums.fetch(entry[:batch].id, 0) + entry[:amount_cents]
            deposit_sums[entry[:deposit].id] = deposit_sums.fetch(entry[:deposit].id, 0) + entry[:amount_cents]
          end
          unless batch_sums.all? { |id, sum| bounded?(sum, batches.fetch(id).amount_cents) } &&
              deposit_sums.all? { |id, sum| bounded?(sum, deposits.fetch(id).amount_cents) }
            raise Conflict, "Allocation exceeds an observed batch or deposit balance"
          end
          prepared.each do |key, value|
            entry = value[:entry]
            allocation = FundingAllocation.create!(payment_identity: identity, settlement_batch: entry[:batch], funding_deposit: entry[:deposit],
              reconciliation_import: entry[:import], user: user, external_id: key, amount_cents: entry[:amount_cents],
              reason: entry[:reason], facts_digest: value[:digest], source_facts: entry.fetch(:source_facts, {}))
            Access.audit!(identity: identity, user: user, subject: allocation, event: "allocated", reason: entry[:reason],
              facts: { "batch_id" => entry[:batch].external_id, "deposit_id" => entry[:deposit].external_id, "amount_cents" => entry[:amount_cents] })
            prior[key] = allocation
          end
          entries.map { |entry| prior.fetch(entry[:operation_key]) }
        end
      end

      def self.bounded?(value, limit) = value.between?([ 0, limit ].min, [ 0, limit ].max)
    end
  end
end
