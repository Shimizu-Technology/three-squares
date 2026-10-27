# frozen_string_literal: true

module Payments
  module TerminalLease
    def self.lock_lane!(identity_id:, lane_id:)
      key = Digest::SHA256.hexdigest("terminal:#{identity_id}:#{lane_id}")[0, 15].to_i(16)
      ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
    end

    def self.lock_reader!(identity:, terminal_id:)
      return unless identity.provider == 'stripe'
      key = Digest::SHA256.hexdigest("stripe-reader:#{identity.id}:#{terminal_id}")[0, 15].to_i(16)
      ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
    end

    # Caller holds session → attempt → charge → order before appending the lane.
    # Administration takes only lane/terminal locks and never locks an attempt.
    def self.reserve_locked!(attempt)
      TerminalContext.validate!(attempt: attempt, available: true)
      terminal = attempt.payment_terminal
      lock_reader!(identity: terminal.payment_identity, terminal_id: terminal.terminal_id)
      lock_lane!(identity_id: terminal.payment_identity_id, lane_id: terminal.lane_id)
      terminal.lock!
      terminal.release_resolved!
      raise Conflict, 'Reader administration is unresolved. Check the saved pairing before collecting.' if TerminalAdministration.active.exists?(payment_identity_id: terminal.payment_identity_id, lane_id: terminal.lane_id)
      if terminal.leased_attempt_id && terminal.leased_attempt_id != attempt.id
        raise Conflict, "Reader in use for #{terminal.leased_attempt.order.order_number}. Check that payment before retrying."
      end
      TerminalContext.validate!(attempt: attempt, available: true)
      terminal.update!(leased_attempt: attempt, leased_at: terminal.leased_at || Time.current, status: 'waiting_for_card')
      terminal
    end

    def self.observe_reader(attempt, result)
      # Only the simulator's authenticated ledger emits this readiness fact.
      # A financial unknown or connection heartbeat alone never enables a reader.
      return unless result&.metadata&.dig(:simulated) && result.metadata[:reader_state] == 'waiting_for_card'
      terminal = attempt.payment_terminal
      terminal&.with_lock do
        stored = attempt.reload
        if terminal.leased_attempt_id == stored.id && terminal.status == 'processing' && !terminal.command_token &&
            !stored.cancel_requested_at && !stored.compensation_claimed_at && !%w[captured failed cancelled compensated].include?(stored.state)
          terminal.update!(status: 'waiting_for_card')
        end
      end
    end

    def self.release_resolved(attempt)
      terminal = attempt.payment_terminal
      terminal&.with_lock { terminal.release_resolved! }
    end
  end
end
