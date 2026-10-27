# frozen_string_literal: true

module Payments
  module Reconciliation
    class SimulateClose
      SCENARIOS = %w[ordinary combined split weekend missing duplicate mismatch external_refund].freeze
      def self.call(**arguments) = new.call(**arguments)

      def call(identity:, user:, operation_key:, scenario:, lag_days: 2, fee_cents: 0)
        Access.check!(user: user, identity: identity)
        Simulation::Guard.validate!(identity)
        unless SCENARIOS.include?(scenario) && lag_days.is_a?(Integer) && lag_days.between?(0, 14) && fee_cents.is_a?(Integer) && fee_cents.between?(0, 10_000)
          raise Error, "Choose a supported funding scenario, 0–14 days lag and 0–10,000 synthetic fee cents"
        end
        digest = Snapshot.digest(scenario: scenario, lag_days: lag_days, fee_cents: fee_cents)
        ReconciliationImport.transaction do
          Access.lock!(identity)
          prior = ReconciliationImport.find_by(payment_identity: identity, operation_key: operation_key)
          if prior
            raise Conflict, "Batch-close key belongs to a different saved request" unless prior.source == "simulator" && prior.request_digest == digest && prior.user_id == user.id
            next prior
          end
          timeline = ReconciliationTimeline.find_or_create_by!(payment_identity: identity) { |t| t.now = Time.current }
          timeline.lock!
          @identity, @now, @sequence = identity, timeline.now, timeline.sequence + 1
          ledger = SimulatedPaymentRecord.where(payment_identity: identity, state: %w[captured partial succeeded])
            .where(kind: %w[collection refund reversal void])
            .where("NOT EXISTS (SELECT 1 FROM settlement_items si WHERE si.payment_identity_id = simulated_payment_records.payment_identity_id AND si.external_id = 'sim-ledger-' || simulated_payment_records.id::text)")
            .order(:created_at, :id).limit(801).to_a
          pending = ledger
          raise Error, "No new simulated money to close" if pending.empty?
          raise Error, "Close a smaller set of simulated transactions" if pending.size > 800
          groups = pending.group_by do |r|
            attempt = r.payment_attempt || SimulatedPaymentRecord.find_by!(payment_identity: identity, raw_id: r.original_reference, kind: "collection").payment_attempt
            [ attempt.order.location_id, attempt.payment_terminal_id, attempt.checkout_session.channel, event_time(r).in_time_zone("Pacific/Guam").to_date.iso8601 ]
          end
          if scenario == "combined" && groups.size < 2
            raise Error, "Combined funding needs at least two simulated transactions" if pending.size < 2
            origin = groups.keys.first
            groups = pending.each_slice((pending.size / 2.0).ceil).each_with_index.to_h { |rows, index| [ [ origin[0], origin[1], index, origin[3] ], rows ] }
          end
          records, batches = [], []
          groups.each_with_index do |(group, rows), index|
            id = "sim-batch-#{@sequence}-#{index + 1}"
            items = rows.map { |r| item(r, id) }
            voided = items.select { |i| %w[void reversal].include?(i["entry_type"]) }.map { |i| i["original_reference"] }
            sales = items.select { |i| i["entry_type"] == "sale" && !voided.include?(i["transaction_id"]) }.sum { |i| i["amount_cents"] }
            returns = items.select { |i| i["entry_type"] == "return" && !voided.include?(i["original_reference"]) }.sum { |i| i["amount_cents"] }
            # A reversal visible after its sale was closed is a new correction;
            # preserve the original batch rather than silently changing history.
            adjustments = items.select { |i| %w[void reversal].include?(i["entry_type"]) && !items.any? { |s| s["entry_type"] == "sale" && s["transaction_id"] == i["original_reference"] } }.sum { |i| -i["amount_cents"] }
            if adjustments.nonzero?
              items << base("item", "#{id}-late-adjustment").merge("batch_id" => id, "entry_type" => "adjustment", "amount_cents" => adjustments,
                "description" => "Synthetic late reversal correction; original batch retained")
            end
            if scenario == "external_refund" && index.zero?
              returns += 100
              items << base("item", "#{id}-external-refund").merge("batch_id" => id, "entry_type" => "return", "transaction_id" => "sim-external-return-#{@sequence}",
                "original_reference" => items.find { |i| i["entry_type"] == "sale" }&.fetch("transaction_id"), "amount_cents" => 100, "description" => "Synthetic out-of-band refund; no application refund authority")
            end
            if fee_cents.positive?
              items << base("item", "#{id}-fee").merge("batch_id" => id, "entry_type" => "fee", "amount_cents" => fee_cents, "description" => "Synthetic flat fee; no bank pricing claim")
            end
            row = base("batch", id).merge("location_id" => group[0], "terminal_id" => group[1]&.to_s, "business_date" => group[3],
              "provider_batch_date" => @now.to_date.iso8601, "sales_cents" => sales, "returns_cents" => returns, "fees_cents" => fee_cents,
              "adjustments_cents" => adjustments, "amount_cents" => sales - returns - fee_cents + adjustments, "description" => "Simulated batch close; no money moves")
            records.concat([ row, *items ])
            batches << row
          end
          plan = funding(batches, scenario, lag_days)
          input = CanonicalCSV.dump(records: records, context: Access.context(identity))
          result = Import.call(identity: identity, user: user, operation_key: operation_key, input: input, source: "simulator", request_digest: digest,
            source_parameters: { "scenario" => scenario, "lag_days" => lag_days, "fee_cents" => fee_cents, "funding" => plan })
          timeline.update!(sequence: @sequence)
          result
        end
      end

      def self.advance(identity:, user:, seconds:, operation_key:)
        Access.check!(user: user, identity: identity)
        Simulation::Guard.validate!(identity)
        unless seconds.is_a?(Integer) && seconds.between?(1, 31.days.to_i) && operation_key.is_a?(String) && operation_key.match?(/\A[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,127}\z/)
          raise Error, "Use a stable key and an accounting advance of 1 second to 31 days"
        end
        ReconciliationTimeline.transaction do
          Access.lock!(identity)
          prior = ReconciliationAudit.where(payment_identity: identity, event: "accounting_clock_advanced").find_by("facts ->> 'operation_key' = ?", operation_key)
          if prior
            raise Conflict, "Clock key belongs to another request" unless prior.user_id == user.id && prior.facts["seconds"] == seconds
            next ReconciliationTimeline.find_by!(payment_identity: identity)
          end
          timeline = ReconciliationTimeline.find_or_create_by!(payment_identity: identity) { |t| t.now = Time.current }
          timeline.update!(now: timeline.now + seconds)
          Access.audit!(identity: identity, user: user, subject: timeline, event: "accounting_clock_advanced", reason: "Advance isolated simulated accounting time", facts: { "operation_key" => operation_key, "seconds" => seconds })
          timeline
        end
      end

      def self.funding_export(identity:, user:, import:)
        Access.check!(user: user, identity: identity)
        Simulation::Guard.validate!(identity)
        raise BindingError, "Unknown simulated batch close" unless import.payment_identity_id == identity.id && import.source == "simulator"
        plan = import.source_parameters.fetch("funding")
        raise Error, "Missing funding scenario: no synthetic deposit is available" if plan["records"].empty?
        timeline = ReconciliationTimeline.find_by!(payment_identity: identity)
        raise Error, "Funding is not visible until #{plan['visible_at']} in the accounting clock" if timeline.now < Time.iso8601(plan.fetch("visible_at"))
        CanonicalCSV.dump(records: plan.fetch("records"), context: Access.context(identity))
      end

      private

      def item_id(row) = "sim-ledger-#{row.id}"
      def event_time(row) = row.facts["dispatched_at"] ? Time.iso8601(row.facts["dispatched_at"]) : row.created_at
      def base(type, id)
        { "record_type" => type, "external_id" => id, "occurred_at" => @now.utc.iso8601(6), "business_date" => @now.in_time_zone("Pacific/Guam").to_date.iso8601 }
      end
      def item(row, batch_id)
        type = { "collection" => "sale", "refund" => "return", "void" => "void", "reversal" => "reversal" }.fetch(row.kind)
        attempt = row.payment_attempt || SimulatedPaymentRecord.find_by!(payment_identity: @identity, raw_id: row.original_reference, kind: "collection").payment_attempt
        amount = row.kind == "collection" ? row.facts.fetch("approved_cents", row.amount_cents) : row.amount_cents
        time = event_time(row)
        base("item", item_id(row)).merge("batch_id" => batch_id, "transaction_id" => row.raw_id, "original_reference" => row.original_reference,
          "entry_type" => type, "amount_cents" => amount, "location_id" => attempt.order.location_id, "terminal_id" => attempt.payment_terminal_id&.to_s,
          "occurred_at" => time.utc.iso8601(6), "business_date" => time.in_time_zone("Pacific/Guam").to_date.iso8601,
          "description" => "Persisted simulated processor ledger observation")
      end
      def funding(batches, scenario, lag)
        day = @now.in_time_zone("Pacific/Guam").to_date + lag
        day += 1 while day.saturday? || day.sunday? if scenario == "weekend"
        visible = Time.use_zone("Pacific/Guam") { Time.zone.local(day.year, day.month, day.day) }
        records = []
        if scenario == "combined"
          records << { "record_type" => "deposit", "external_id" => "sim-deposit-#{@sequence}-combined", "amount_cents" => batches.sum { |b| b["amount_cents"] }, "deposit_date" => day.iso8601 }
          batches.each { |b| records << allocation(b, records.first["external_id"], b["amount_cents"], "combined") unless b["amount_cents"].zero? }
        elsif scenario != "missing"
          batches.each_with_index do |batch, index|
            amount = batch["amount_cents"]
            portions = scenario == "split" && amount.abs > 1 ? [ amount.div(2), amount - amount.div(2) ] : [ amount ]
            portions.each_with_index do |portion, part|
              id = "sim-deposit-#{@sequence}-#{index + 1}-#{part + 1}"
              records << { "record_type" => "deposit", "external_id" => id, "amount_cents" => portion + (scenario == "mismatch" && index.zero? ? 17 : 0), "deposit_date" => day.iso8601 }
              records << allocation(batch, id, portion, "#{index}-#{part}") unless portion.zero?
            end
          end
        end
        records += records.map(&:dup) if scenario == "duplicate"
        { "visible_at" => visible.iso8601, "records" => records.map { |r| r.merge("description" => "Synthetic funding; no bank deposit or fee promise") } }
      end
      def allocation(batch, id, amount, suffix)
        { "record_type" => "allocation", "external_id" => "#{batch['external_id']}-funding-#{suffix}", "batch_id" => batch["external_id"], "deposit_id" => id, "amount_cents" => amount }
      end
    end
  end
end
