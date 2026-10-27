# frozen_string_literal: true

module Payments
  module Reconciliation
    # CSV/API adapters supply observations to this single durable import boundary.
    # No payment, refund, order or stock mutation is available here.
    class Import
      def self.call(**arguments) = new.call(**arguments)

      def call(identity:, user:, input:, operation_key:, source: "canonical_csv", request_digest: nil, source_parameters: {})
        Access.check!(user: user, identity: identity)
        if source != "canonical_csv" && !(source == "simulator" && identity.environment == "simulated")
          raise BindingError, "Unsupported accounting source"
        end
        unless operation_key.is_a?(String) && operation_key.match?(/\A[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,127}\z/) &&
            input.is_a?(String) && input.bytesize.between?(1, CanonicalCSV::MAX_BYTES)
          raise Error, "A stable import key and bounded canonical CSV are required"
        end
        input = input.dup.freeze
        @identity, @user = identity, user
        ReconciliationImport.transaction do
          Access.lock!(identity)
          digest = Digest::SHA256.hexdigest(input)
          prior = ReconciliationImport.find_by(payment_identity: identity, operation_key: operation_key)
          if prior
            unless prior.payload_digest == digest && prior.source == source && prior.user_id == user.id
              raise Conflict, "Import key belongs to a different saved request"
            end
            next prior
          end
          records = CanonicalCSV.parse(input, context: Access.context(identity)).fetch(:records)
          @import = ReconciliationImport.create!(payment_identity: identity, user: user, operation_key: operation_key,
            payload_digest: digest, request_digest: request_digest, source_parameters: source_parameters,
            schema_version: CanonicalCSV::VERSION, source: source)
          @counts = Hash.new(0)
          records.select { |r| r["record_type"] == "batch" }.each { |row| batch(row) }
          records.select { |r| r["record_type"] == "deposit" }.each { |row| deposit(row) }
          records.select { |r| r["record_type"] == "item" }.each { |row| item(row) }
          allocate(records.select { |r| r["record_type"] == "allocation" })
          check_membership
          check_funding
          @import.update!(state: @counts["exceptions"].positive? ? "conflicted" : "succeeded", processed_at: Time.current, summary: @counts)
          Access.audit!(identity: identity, user: user, subject: @import, event: "imported", reason: "Imported #{source} observations", facts: @counts)
          @import
        end
      end

      private

      def conflict(category, row, batch: nil, deposit: nil)
        @counts["exceptions"] += 1
        Access.exception!(identity: @identity, import: @import, batch: batch, deposit: deposit,
          category: category, facts: row.slice("record_type", "external_id", "batch_id", "deposit_id", "transaction_id", "original_reference", "amount_cents", "business_date", "occurred_at", "provider_local_time", "provider_offset"))
      end

      def create_observation(model, row, attributes)
        digest = Snapshot.digest(row)
        prior = model.find_by(payment_identity: @identity, external_id: row.fetch("external_id"))
        if prior
          prior.facts_digest == digest ? @counts["replayed"] += 1 : conflict("conflicting_source_record", row, batch: prior.is_a?(SettlementBatch) ? prior : nil, deposit: prior.is_a?(FundingDeposit) ? prior : nil)
          return [ prior, false ]
        end
        record = model.create!(attributes.merge(payment_identity: @identity, reconciliation_import: @import,
          external_id: row.fetch("external_id"), facts_digest: digest, source_facts: row))
        @counts[model.model_name.plural] += 1
        [ record, true ]
      end

      def batch(row)
        unless row["amount_cents"] == row["sales_cents"] - row["returns_cents"] - row["fees_cents"] + row["adjustments_cents"]
          return conflict("batch_net_mismatch", row)
        end
        if row["location_id"] && !Location.exists?(row["location_id"])
          return conflict("unassigned_location", row)
        end
        create_observation(SettlementBatch, row, row.slice("location_id", "terminal_id", "business_date", "provider_batch_date",
          "sales_cents", "returns_cents", "fees_cents", "adjustments_cents", "amount_cents").merge("closed_at" => row["occurred_at"]))
      end

      def deposit(row)
        create_observation(FundingDeposit, row, row.slice("deposit_date", "amount_cents"))
      end

      def item(row)
        batch = SettlementBatch.find_by(payment_identity: @identity, external_id: row["batch_id"])
        return conflict("missing_batch", row) unless batch
        # A close observation freezes membership. Later imports may replay existing
        # items, but cannot append to a batch first observed in an earlier import.
        existing = SettlementItem.find_by(payment_identity: @identity, external_id: row["external_id"])
        if !existing && row["transaction_id"].present? && %w[sale return void reversal].include?(row["entry_type"]) &&
            SettlementItem.exists?(payment_identity: @identity, entry_type: row["entry_type"], transaction_id: row["transaction_id"])
          return conflict("duplicate_financial_item", row, batch: batch)
        end
        if batch.reconciliation_import_id != @import.id && !existing
          return conflict("closed_batch_membership", row, batch: batch)
        end
        time = Time.iso8601(row.fetch("occurred_at"))
        if row["provider_local_time"] && Time.iso8601(row["provider_local_time"].tr(" ", "T") + row.fetch("provider_offset")).to_i != time.to_i
          conflict("provider_time_mismatch", row, batch: batch)
        end
        if time.in_time_zone("Pacific/Guam").to_date.iso8601 != row["business_date"] ||
            (row["location_id"] && !Location.exists?(row["location_id"])) ||
            (row["entry_type"] != "adjustment" && row["amount_cents"].negative?)
          return conflict("invalid_item_context", row, batch: batch)
        end
        attributes = row.slice("location_id", "terminal_id", "transaction_id", "original_reference", "entry_type", "amount_cents", "occurred_at",
          "provider_local_time", "provider_offset", "business_date").merge("settlement_batch" => batch)
        transaction = PaymentTransaction.find_by(payment_identity: @identity, raw_provider_id: row["entry_type"] == "sale" ? row["transaction_id"] : row["original_reference"])
        legacy = LegacyCaptureBinding.find_by(payment_identity: @identity, original_reference: row["entry_type"] == "sale" ? row["transaction_id"] : row["original_reference"])
        if row["entry_type"] == "sale"
          if transaction && transaction.amount_cents == row["amount_cents"] && transaction.currency == @identity.currency
            attributes["payment_transaction"] = transaction
          elsif legacy && legacy.verified_at && legacy.amount_cents == row["amount_cents"] && legacy.currency == @identity.currency
            attributes["legacy_capture_binding"] = legacy
          else
            conflict("unassigned_transaction", row, batch: batch)
          end
        elsif row["entry_type"] == "return"
          matches = RefundOperation.where(payment_identity: @identity, raw_provider_id: row["transaction_id"], original_reference: row["original_reference"], kind: "return", state: "succeeded", amount_cents: row["amount_cents"]).limit(2).to_a
          if matches.one? && (transaction || legacy)
            attributes["refund_operation"] = matches.first
            attributes["payment_transaction"] = transaction
            attributes["legacy_capture_binding"] = legacy
          else
            conflict("external_refund", row, batch: batch)
          end
        elsif %w[void reversal].include?(row["entry_type"])
          void = RefundOperation.find_by(payment_identity: @identity, raw_provider_id: row["transaction_id"],
            original_reference: row["original_reference"], state: "succeeded", kind: "void", amount_cents: row["amount_cents"]) if row["entry_type"] == "void"
          if transaction && (transaction.state == "compensated" || void)
            attributes["payment_transaction"] = transaction
            attributes["refund_operation"] = void if void
          else
            conflict("unverified_reversal", row, batch: batch)
          end
        end
        create_observation(SettlementItem, row, attributes)
      end

      def check_membership
        SettlementBatch.where(reconciliation_import: @import).find_each do |batch|
          items = batch.settlement_items.to_a
          voided = items.select { |item| %w[void reversal].include?(item.entry_type) }.map(&:original_reference).compact
          sales = items.select { |item| item.entry_type == "sale" && !voided.include?(item.transaction_id) }.sum(&:amount_cents)
          returns = items.select { |item| item.entry_type == "return" && !voided.include?(item.original_reference) }.sum(&:amount_cents)
          fees = items.select { |item| item.entry_type == "fee" }.sum(&:amount_cents)
          adjustments = items.select { |item| item.entry_type == "adjustment" }.sum(&:amount_cents)
          unless [ sales, returns, fees, adjustments ] == [ batch.sales_cents, batch.returns_cents, batch.fees_cents, batch.adjustments_cents ]
            conflict("batch_items_mismatch", { "record_type" => "batch", "external_id" => batch.external_id, "amount_cents" => batch.amount_cents }, batch: batch)
          end
        end
      end

      def allocate(rows)
        return if rows.empty?
        entries = rows.filter_map do |row|
          batch = SettlementBatch.find_by(payment_identity: @identity, external_id: row["batch_id"])
          deposit = FundingDeposit.find_by(payment_identity: @identity, external_id: row["deposit_id"])
          unless batch && deposit
            conflict("unmatched_allocation", row, batch: batch, deposit: deposit)
            next
          end
          { batch: batch, deposit: deposit, amount_cents: row["amount_cents"], operation_key: row["external_id"],
            reason: row["description"] || "Exact source allocation #{row['external_id']}", import: @import, source_facts: row }
        end
        return if entries.empty?
        before = FundingAllocation.where(payment_identity: @identity, external_id: entries.map { |e| e[:operation_key] }).pluck(:external_id)
        Allocate.bulk(identity: @identity, user: @user, entries: entries)
        keys = entries.map { |e| e[:operation_key] }
        @counts["funding_allocations"] += (keys.uniq - before).size
        @counts["replayed"] += keys.size - (keys.uniq - before).size
      rescue Conflict, BindingError, Error
        entries.each { |entry| conflict("allocation_conflict", entry.fetch(:source_facts)) }
      end

      def check_funding
        FundingDeposit.where(reconciliation_import: @import).find_each do |deposit|
          allocated = deposit.funding_allocations.sum(:amount_cents)
          if allocated != deposit.amount_cents
            conflict("unallocated_deposit", { "record_type" => "deposit", "external_id" => deposit.external_id,
              "amount_cents" => deposit.amount_cents - allocated }, deposit: deposit)
          end
        end
        batch_ids = FundingAllocation.where(reconciliation_import: @import).select(:settlement_batch_id)
        SettlementBatch.where(id: batch_ids).find_each do |batch|
          allocated = batch.funding_allocations.sum(:amount_cents)
          if allocated != batch.amount_cents
            conflict("partial_funding", { "record_type" => "batch", "external_id" => batch.external_id,
              "amount_cents" => batch.amount_cents - allocated }, batch: batch)
          end
        end
      end
    end
  end
end
