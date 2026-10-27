# frozen_string_literal: true

module Payments
  module Reconciliation
    # Reuse the foundation's durable refusal ledger. A validation response is
    # abandonment proof only after the same actor/account/key is fenced forever.
    module RequestDecision
      class Rejected < Conflict
        attr_reader :operation_key
        def initialize(message, operation_key:)
          super(message)
          @operation_key = operation_key
        end
      end

      def self.owner(identity, user, kind) = "reconciliation:#{identity.id}:#{user.id}:#{kind}"
      def self.refusal(identity:, user:, kind:, operation_key:)
        RejectedPaymentRequest.find_by(owner_key: owner(identity, user, kind), caller_idempotency_key: operation_key)
      end

      def self.call(identity:, user:, kind:, operation_key:, payload:, accepted:)
        Access.check!(user: user, identity: identity)
        unless operation_key.is_a?(String) && operation_key.match?(/\A[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,127}\z/)
          raise Error, "A stable accounting request key is required"
        end
        digest = Snapshot.digest(actor_id: user.id, payload: payload)
        rejected = nil
        result = RejectedPaymentRequest.transaction do
          Access.lock!(identity)
          refused = refusal(identity: identity, user: user, kind: kind, operation_key: operation_key)
          if refused
            raise Conflict, "Request key was already used for different accounting details" unless refused.payload_digest == digest
            rejected = Rejected.new(refused.reason, operation_key: operation_key)
            next nil
          end
          begin
            # Roll back any partial observations, retaining the refusal outside
            # this savepoint. Unexpected errors remain uncertain and retryable.
            ApplicationRecord.transaction(requires_new: true) { yield }
          rescue Error, CanonicalCSV::Invalid, Configuration::UnsafeConfiguration, ActiveRecord::RecordInvalid => error
            raise if error.is_a?(BindingError) || accepted.call
            RejectedPaymentRequest.create!(owner_key: owner(identity, user, kind), caller_idempotency_key: operation_key,
              payload_digest: digest, reason: error.message.to_s[0, 500])
            rejected = Rejected.new(error.message, operation_key: operation_key)
            nil
          end
        end
        raise rejected if rejected
        result
      end
    end
  end
end
