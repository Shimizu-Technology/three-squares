# frozen_string_literal: true

module Payments
  # Channel determines staff/order ownership. Collection mode independently
  # selects a hosted CNP profile or a physical lane before the intent freezes.
  module TerminalContext
    PROFILE_KEYS = %w[application_version contract_approved contract_version usd_query_contract reporting_time_zone
                      captured_statuses declined_statuses allowed_payment_types debit_refund_enabled
                      linked_return_enabled known_id_reversal_enabled reversal_type stripe_terminal_location_id
                      stripe_terminal_locations sale_types query_completeness_approved request_timeout_seconds
                      user_input_timeout cancelled_statuses].freeze

    def self.mode(channel:, attributes:)
      return 'hosted' if channel == 'online'
      attributes['payment_method'] == 'card_online' ? 'hosted' : 'terminal'
    end

    def self.capture(profile:, location_id:, terminal_id:)
      raise Error, 'Select a payment reader before saving a card-present order' if terminal_id.blank?
      terminal = PaymentTerminal.find(terminal_id)
      unless terminal.payment_identity_id == profile.payment_identity_id && terminal.location_id.to_s == location_id.to_s &&
          (!terminal.payment_profile_id || terminal.payment_profile_id == profile.id) && terminal.enabled? && !terminal.retired_at
        raise BindingError, 'Reader does not match the selected location/payment account'
      end
      {
        'id' => terminal.id, 'lane_id' => terminal.lane_id, 'terminal_id' => terminal.terminal_id,
        'payment_identity_id' => terminal.payment_identity_id, 'location_id' => terminal.location_id,
        'device_serial' => terminal.device_serial, 'device_model' => terminal.device_model,
        'profile' => {'id' => profile.id, 'presentation' => profile.presentation, 'capabilities' => profile.capabilities.slice(*PROFILE_KEYS)}
      }
    end

    def self.validate!(attempt:, available: false)
      Snapshot.validate!(session: attempt.checkout_session, attempt: attempt, order: attempt.order, current: false)
      validate_mode!(attempt)
      saved = attempt.snapshot.dig('collection', 'terminal')
      unless attempt.collection_mode == 'terminal' && saved.is_a?(Hash) && attempt.payment_terminal_id == saved['id'] &&
          saved['payment_identity_id'] == attempt.payment_identity_id && saved['location_id'] == attempt.checkout_session.location_id
        raise BindingError, 'Original terminal binding is unavailable'
      end
      terminal = attempt.payment_terminal || raise(BindingError, 'Original reader is unavailable')
      expected = saved.slice('lane_id', 'terminal_id', 'payment_identity_id', 'location_id')
      expected.merge!(saved.slice('device_serial', 'device_model')) if available || attempt.dispatched_at.nil?
      unless expected.all? { |key, value| terminal.public_send(key) == value }
        raise BindingError, 'Reader assignment changed after this payment was saved'
      end
      if available && (!terminal.enabled? || terminal.retired_at || terminal.status == 'offline' || terminal.connection_state == 'offline')
        raise Conflict, 'Reader is offline or unavailable. Reconnect it before taking payment.'
      end
      saved
    end

    def self.validate_mode!(attempt)
      saved = attempt.snapshot['collection']
      return unless saved # Historical intents retain their original adapter.
      unless saved['mode'] == attempt.collection_mode && saved.dig('terminal', 'id') == attempt.payment_terminal_id &&
          (attempt.checkout_session.channel == 'pos' || attempt.collection_mode == 'hosted')
        raise BindingError, 'Original collection method changed'
      end
    end
  end
end
