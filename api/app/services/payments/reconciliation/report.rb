# frozen_string_literal: true

module Payments
  module Reconciliation
    module Report
      LIMIT = 100
      def self.call(identity:, user:, from:, to:, location_id: nil)
        Access.check!(user: user, identity: identity)
        first, last = Date.iso8601(from), Date.iso8601(to)
        raise Error, "Choose up to 366 Guam business dates" unless last >= first && (last - first).to_i <= 365
        batches = SettlementBatch.where(payment_identity: identity, business_date: first..last)
        if location_id.present?
          raise Error, "Unknown location" unless location_id.to_s.match?(/\A[1-9]\d*\z/) && Location.exists?(location_id)
          batches = batches.where(location_id: location_id)
        end
        batch_ids = batches.select(:id)
        batch_allocated = FundingAllocation.where(settlement_batch_id: batch_ids).group(:settlement_batch_id).sum(:amount_cents)
        # Deposits retain their complete account-level amount even when only some
        # constituent batches match the selected location/business dates.
        deposits = FundingDeposit.where(id: FundingAllocation.where(settlement_batch_id: batch_ids).select(:funding_deposit_id))
        deposits = FundingDeposit.where(payment_identity: identity) if location_id.blank?
        deposit_allocated = FundingAllocation.where(funding_deposit_id: deposits.select(:id)).group(:funding_deposit_id).sum(:amount_cents)
        exceptions = ReconciliationException.where(payment_identity: identity)
        exceptions = exceptions.where(settlement_batch_id: batch_ids) if location_id.present?
        imports = ReconciliationImport.where(payment_identity: identity)
        timeline = ReconciliationTimeline.find_by(payment_identity: identity)
        {
          identity: identity_json(identity), from: first.iso8601, to: last.iso8601,
          accounting_time: timeline&.now&.iso8601, locations: Location.order(:name).pluck(:id, :name).map { |id, name| { id: id, name: name } },
          voidable_attempts: identity.environment == "simulated" ? voidable_attempts(identity) : [],
          totals: { sales_cents: batches.sum(:sales_cents), returns_cents: batches.sum(:returns_cents), fees_cents: batches.sum(:fees_cents),
            adjustments_cents: batches.sum(:adjustments_cents), batch_net_cents: batches.sum(:amount_cents),
            allocated_cents: batch_allocated.values.sum, open_exceptions: exceptions.where(state: "open").count },
          batches: batches.order(business_date: :desc, id: :desc).limit(LIMIT).map { |b| batch_json(b, batch_allocated.fetch(b.id, 0)) },
          deposits: deposits.order(deposit_date: :desc, id: :desc).limit(LIMIT).map { |d| deposit_json(d, deposit_allocated.fetch(d.id, 0)) },
          exceptions: exceptions.order(created_at: :desc, id: :desc).limit(LIMIT).map { |e| exception_json(e) },
          imports: imports.order(created_at: :desc, id: :desc).limit(LIMIT).map { |i| import_json(i) },
          truncated: { batches: batches.count > LIMIT, deposits: deposits.count > LIMIT, exceptions: exceptions.count > LIMIT, imports: imports.count > LIMIT }
        }
      rescue Date::Error
        raise Error, "Use valid YYYY-MM-DD Guam business dates"
      end

      def self.identity_json(i) = { id: i.id, provider: i.provider, environment: i.environment, account_id: i.external_account_id, currency: i.currency }
      def self.voidable_attempts(identity)
        PaymentAttempt.where(payment_identity: identity, state: "captured").joins(:order).where(orders: { payment_status: "paid", simulated: true })
          .where.not(id: RefundOperation.holding.where(payment_identity: identity).where.not(payment_attempt_id: nil).select(:payment_attempt_id))
          .where("NOT EXISTS (SELECT 1 FROM settlement_items si WHERE si.payment_identity_id = payment_attempts.payment_identity_id AND si.entry_type = 'sale' AND si.transaction_id = payment_attempts.raw_provider_id)")
          .includes(:order).order(:created_at, :id).limit(LIMIT).map { |a| { attempt_id: a.id, order_number: a.order.order_number, amount_cents: a.requested_cents } }
      end
      def self.batch_json(b, allocated)
        b.attributes.slice("id", "external_id", "location_id", "terminal_id", "business_date", "provider_batch_date", "closed_at",
          "sales_cents", "returns_cents", "fees_cents", "adjustments_cents", "amount_cents").merge("allocated_cents" => allocated, "remaining_cents" => b.amount_cents - allocated)
      end
      def self.deposit_json(d, allocated)
        d.attributes.slice("id", "external_id", "deposit_date", "amount_cents").merge("allocated_cents" => allocated, "remaining_cents" => d.amount_cents - allocated)
      end
      def self.exception_json(e) = e.attributes.slice("id", "category", "state", "facts", "settlement_batch_id", "funding_deposit_id", "review_reason", "reviewed_at")
      def self.import_json(i) = i.attributes.slice("id", "operation_key", "payload_digest", "source", "state", "summary", "processed_at")

      def self.export(identity:, user:)
        Access.check!(user: user, identity: identity)
        records = []
        [ SettlementBatch, SettlementItem, FundingDeposit, FundingAllocation ].each do |model|
          model.where(payment_identity: identity).order(:created_at, :id).limit(CanonicalCSV::MAX_ROWS + 1).each do |record|
            facts = record.source_facts
            if facts.empty? && record.is_a?(FundingAllocation)
              facts = { "record_type" => "allocation", "external_id" => record.external_id, "batch_id" => record.settlement_batch.external_id,
                "deposit_id" => record.funding_deposit.external_id, "amount_cents" => record.amount_cents, "description" => "Manual allocation; see audit history" }
            end
            records << facts
            raise Error, "Export exceeds 1,000 records; use an accounting adapter with bounded pages" if records.size > CanonicalCSV::MAX_ROWS
          end
        end
        raise Error, "No accounting observations to export" if records.empty?
        CanonicalCSV.dump(records: records, context: Access.context(identity))
      end
    end
  end
end
