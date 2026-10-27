# frozen_string_literal: true

module Payments
  module TerminalLease
    def self.lock_lane!(identity_id:, lane_id:)
      key = Digest::SHA256.hexdigest("terminal:#{identity_id}:#{lane_id}")[0, 15].to_i(16)
      ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
    end

    # Caller holds session → attempt → charge → order before appending the lane.
    # Administration takes only lane/terminal locks and never locks an attempt.
    def self.reserve_locked!(attempt)
      TerminalContext.validate!(attempt: attempt, available: true)
      terminal = attempt.payment_terminal
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

    def self.release_resolved(attempt)
      terminal = attempt.payment_terminal
      terminal&.with_lock { terminal.release_resolved! }
    end
  end
end
