# frozen_string_literal: true

module Payments
  class ManageTerminal
    def self.call(**arguments) = new.call(**arguments)

    def call(user:, profile:, location:, lane_id:, terminal_reference:, label:, operation_key:, kind:, terminal: nil, activation_code: nil, adapter: nil)
      unless profile&.enabled? && profile.channel == 'pos' && (!profile.location_id || profile.location_id == location.id) &&
          StaffAccessPolicy.new(user).allowed?('payments.terminals.manage', location_id: location.id)
        raise BindingError, 'Reader profile/location is unavailable'
      end
      Configuration.validate_identity!(profile.payment_identity)
      unless operation_key.to_s.match?(/\A[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\z/) && %w[pair retire].include?(kind)
        raise Error, 'A stable administration request key is required'
      end
      lane_id, terminal_reference, label = [lane_id, terminal_reference, label].map(&:to_s)
      unless lane_id.match?(/\A[A-Za-z0-9_-]{1,64}\z/) && terminal_reference.match?(/\A[A-Za-z0-9_-]{1,128}\z/) && label.length.between?(1, 120)
        raise Error, 'Reader lane, terminal and label are invalid'
      end
      identity = profile.payment_identity
      payload = {kind: kind, profile: profile.id, location: location.id, lane: lane_id, terminal: terminal_reference, label: label}
      operation = TerminalAdministration.transaction do
        TerminalLease.lock_lane!(identity_id: identity.id, lane_id: lane_id)
        prior = TerminalAdministration.find_by(payment_identity: identity, operation_key: operation_key)
        if prior
          raise Conflict, 'Administration key was reused for different reader details' unless prior.payload_digest == Snapshot.digest(payload) && prior.user_id == user.id
          next prior
        end
        existing = PaymentTerminal.lock.find_by(payment_identity: identity, lane_id: lane_id)
        if existing
          existing.release_resolved!
          raise Conflict, 'Reader has an unresolved payment. Check that saved payment first.' if existing.leased_attempt_id || existing.command_token
          raise BindingError, 'Reader assignment does not match this operation' if terminal && existing.id != terminal.id
          unless existing.location_id == location.id && existing.terminal_id == terminal_reference
            raise BindingError, 'Reader is already assigned to another location/terminal'
          end
          terminal = existing
        end
        raise Conflict, 'Reader administration is already saved. Check that operation before retrying.' if TerminalAdministration.active.exists?(payment_identity: identity, lane_id: lane_id)
        TerminalAdministration.create!(payment_identity: identity, payment_profile: profile, location: location, user: user,
          payment_terminal: terminal, operation_key: operation_key, lane_id: lane_id, terminal_reference: terminal_reference,
          label: label, kind: kind, payload_digest: Snapshot.digest(payload), facts: {
            'profile' => {'id' => profile.id, 'presentation' => profile.presentation, 'capabilities' => profile.capabilities.slice(*TerminalContext::PROFILE_KEYS)}
          })
      end
      return operation if %w[succeeded failed].include?(operation.state)
      adapter ||= TerminalAdministrationAdapter.new(identity: identity, profile: operation.facts.fetch('profile'))
      adapter.preflight
      if operation.dispatched_at
        observation = adapter.query(operation: operation)
      else
        if kind == 'pair' && !(activation_code.is_a?(String) && activation_code.bytesize.between?(1, 80) && !activation_code.match?(/[\x00-\x1f\x7f]/))
          raise Error, 'Enter the reader activation code to pair this device'
        end
        claimed = operation.with_lock do
          next false if operation.dispatched_at
          operation.update!(state: 'dispatching', dispatched_at: Time.current)
          true
        end
        observation = if claimed
          kind == 'pair' ? adapter.pair(operation: operation, activation_code: activation_code) : adapter.retire(operation: operation)
        else
          adapter.query(operation: operation)
        end
      end
      apply(operation, observation)
    rescue StandardError => error
      if operation && !%w[succeeded failed].include?(operation.reload.state)
        operation.update!(state: operation.dispatched_at ? 'unknown' : 'reserved', error_classification: error.class.name)
        return operation
      end
      raise
    end

    def apply(operation, observation)
      TerminalAdministration.transaction do
        TerminalLease.lock_lane!(identity_id: operation.payment_identity_id, lane_id: operation.lane_id)
        operation.lock!
        return operation if %w[succeeded failed].include?(operation.state)
        unless observation.is_a?(Hash) && %w[succeeded failed unknown].include?(observation[:status])
          raise BindingError, 'Reader administration response is invalid'
        end
        if observation[:status] == 'succeeded'
          unless observation[:lane_id].to_s == operation.lane_id && observation[:terminal_id] == operation.terminal_reference
            raise BindingError, 'Reader administration result does not match the saved lane'
          end
          terminal = operation.payment_terminal || PaymentTerminal.find_or_initialize_by(payment_identity_id: operation.payment_identity_id, lane_id: operation.lane_id)
          terminal.lock! if terminal.persisted?
          terminal.release_resolved! if terminal.persisted?
          raise Conflict, 'Reader acquired an unresolved payment during administration' if terminal.leased_attempt_id
          if operation.kind == 'pair'
            terminal.assign_attributes(location_id: operation.location_id, payment_profile_id: operation.payment_profile_id,
              terminal_id: operation.terminal_reference, label: operation.label, enabled: true, retired_at: nil, status: 'ready',
              connection_state: observation[:connection_state] == 'connected' ? 'connected' : 'unknown', connection_verified_at: Time.current,
              device_serial: observation[:device_serial], device_model: observation[:device_model], device_firmware: observation[:device_firmware])
          else
            raise BindingError, 'Original reader is unavailable' unless terminal.persisted?
            terminal.assign_attributes(enabled: false, retired_at: Time.current, status: 'retired')
          end
          terminal.save!
          operation.update!(payment_terminal: terminal, state: 'succeeded', completed_at: Time.current, error_classification: nil)
        else
          operation.update!(state: observation[:status], completed_at: observation[:status] == 'failed' ? Time.current : nil,
            error_classification: observation[:status] == 'failed' ? 'pairing_rejected' : 'reader_administration_unknown')
        end
        operation
      end
    end
  end
end
