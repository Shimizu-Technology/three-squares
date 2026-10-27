# frozen_string_literal: true

module Payments
  class WorldpayProvider < BaseProvider
    def initialize(identity, runtime_factory: ->(attempt) { Worldpay::Runtime.new(attempt: attempt) })
      super(identity)
      @runtime_factory = runtime_factory
    end

    def preflight(attempt:)
      validate_attempt!(attempt)
      caps = runtime(attempt).profile.fetch("capabilities")
      unless caps["usd_query_contract"] == true && caps["fraud_policy"] == "processor_enforced" && ActiveSupport::TimeZone[caps["reporting_time_zone"]]
        raise Configuration::UnsafeConfiguration, "Assigned USD, fraud and reporting contracts are required"
      end
      Worldpay::HostedCheckout.new(runtime: runtime(attempt)).preflight(attempt: attempt)
      true
    end

    def replay_setup? = false

    def setup(attempt:)
      validate_attempt!(attempt)
      Worldpay::HostedCheckout.new(runtime: runtime(attempt)).setup(attempt: attempt)
    end

    def collection(attempt:)
      validate_attempt!(attempt)
      raise UnsupportedCapability, "Original hosted setup is unavailable" unless attempt.setup_id.present? && attempt.hosted_url.present?
      { raw_id: attempt.raw_provider_id, setup_id: attempt.setup_id, flow: "worldpay_hosted_page", hosted_url: attempt.hosted_url }
    end

    def query(attempt:)
      validate_attempt!(attempt)
      current = runtime(attempt)
      report = if attempt.setup_id.present?
        current.client.transaction_query(setup_id: attempt.setup_id)
      else
        { complete: false, rows: [], metadata: { reason: "setup_response_lost_manual_reconciliation_required" } }
      end
      result = Worldpay::QueryResult.call(attempt: attempt, report: report, configuration: current.configuration, profile: current.profile)
      AttemptLock.call(attempt) do |session, stored, _, order|
        AttemptLock.validate!(session, stored, order)
        metadata = stored.provider_metadata.deep_dup
        if result.metadata[:financial_ambiguity] && !metadata["worldpay_financial_quarantine"]
          metadata["worldpay_financial_quarantine"] = { "observed_at" => Time.current.iso8601(6),
            "reason" => result.metadata[:reason], "report_digest" => Snapshot.digest(report.fetch(:rows)),
            "raw_ids" => report.fetch(:rows).filter_map { |row| row[:raw_id] }.take(20) }
        end
        quarantined = metadata["worldpay_financial_quarantine"].present?
        metadata["worldpay_collection_blocked"] = quarantined || (result.status == "unknown" && !result.metadata[:collection_available])
        stored.update!(provider_metadata: metadata)
        result = Result.new(status: "unknown", identity_id: identity.id, raw_id: nil, requested_cents: stored.requested_cents,
          approved_cents: 0, captured_cents: 0, currency: stored.currency, metadata: { reason: "financial_quarantine_requires_explicit_resolution" }) if quarantined
      end
      result
    end

    # Closing the browser is not a processor cancellation. No-PAN System
    # reversal and operation-specific refund recovery await assigned contracts.
    def cancel(attempt:) = query(attempt: attempt)

    private

    def runtime(attempt)
      @runtimes ||= {}
      @runtimes[attempt.id] ||= @runtime_factory.call(attempt)
    end

    def validate_attempt!(attempt)
      unless attempt.payment_identity_id == identity.id && attempt.checkout_session.payment_identity_id == identity.id &&
          attempt.checkout_session.channel == "online" && attempt.order_id == attempt.checkout_session.order_id
        raise BindingError, "Worldpay adapter does not match the saved online attempt"
      end
      Snapshot.validate!(session: attempt.checkout_session, attempt: attempt, order: attempt.order, current: false)
    end
  end
end
