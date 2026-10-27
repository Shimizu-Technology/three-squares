# frozen_string_literal: true

module Payments
  module Reconciliation
    module Access
      def self.check!(user:, identity:)
        Configuration.validate_environment!
        raise BindingError, "Accounting access is unavailable" unless StaffAccessPolicy.new(user).allowed?("payments.reconcile")
        if Configuration.production? && identity.environment != "production"
          raise BindingError, "Only production accounting is available in production"
        end
        if identity.environment == "simulated"
          raise BindingError, "Simulation accounting is owner only" unless StaffAccessPolicy.new(user).allowed?("payments.simulate")
          Simulation::Guard.validate!(identity)
        end
        raise BindingError, "Accounting requires USD" unless identity.currency == "USD"
        identity
      end

      def self.context(identity)
        { "account_id" => identity.external_account_id, "environment" => identity.environment, "currency" => identity.currency }
      end

      def self.lock!(identity)
        key = Digest::SHA256.hexdigest("reconciliation:#{identity.id}")[0, 15].to_i(16)
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
      end

      def self.reason!(value)
        unless value.is_a?(String) && value.strip.length.between?(1, 240) && !value.match?(/[\p{Cc}]/)
          raise Error, "Enter a reason of 1–240 characters"
        end
        value.strip
      end

      def self.audit!(identity:, user:, subject:, event:, reason:, facts: {})
        ReconciliationAudit.create!(payment_identity: identity, user: user, subject_type: subject.class.name,
          subject_id: subject.id, event: event, reason: reason!(reason), facts: facts)
      end

      def self.exception!(identity:, category:, facts:, import: nil, batch: nil, deposit: nil)
        fingerprint = Snapshot.digest(category: category, facts: facts, batch: batch&.id, deposit: deposit&.id)
        ReconciliationException.create_or_find_by!(payment_identity: identity, fingerprint: fingerprint) do |row|
          row.assign_attributes(category: category, facts: facts, reconciliation_import: import, settlement_batch: batch, funding_deposit: deposit)
        end
      end
    end
  end
end
