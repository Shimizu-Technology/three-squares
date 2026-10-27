# frozen_string_literal: true

module Payments
  class TerminalAdministrationAdapter
    def initialize(identity:, profile:)
      @identity, @profile = Configuration.validate_identity!(identity), profile
    end

    def preflight
      if @identity.environment == 'simulated'
        Simulation::Guard.validate!(@identity)
      elsif @identity.provider == 'worldpay'
        runtime
      else
        raise UnsupportedCapability, 'Register Stripe readers in their assigned location before provisioning them here'
      end
    end

    def pair(operation:, activation_code:)
      unless @identity.environment == 'simulated'
        return lane_observation(runtime.client.pair(lane_id: numeric_lane(operation), terminal_id: operation.terminal_reference,
          activation_code: activation_code, description: operation.label))
      end
      return {status: 'failed'} if activation_code == 'SIM-DECLINE'
      facts = {status: 'succeeded', lane_id: operation.lane_id, terminal_id: operation.terminal_reference,
        device_serial: "sim-device-#{operation.lane_id}", device_model: 'Simulated reader', device_firmware: 'local-fixture', connection_state: 'connected'}
      operation.with_lock { operation.update!(facts: operation.facts.merge('simulated_host_result' => facts.stringify_keys)) }
      raise Error, 'Simulated pairing response lost. Check the saved pairing.' if activation_code == 'SIM-TIMEOUT'
      facts
    end

    def retire(operation:)
      return lane_observation(runtime.client.delete_lane(lane_id: numeric_lane(operation))) unless @identity.environment == 'simulated'
      facts = {status: 'succeeded', lane_id: operation.lane_id, terminal_id: operation.terminal_reference}
      operation.with_lock { operation.update!(facts: operation.facts.merge('simulated_host_result' => facts.stringify_keys)) }
      facts
    end

    def query(operation:)
      if @identity.environment == 'simulated'
        return operation.facts.fetch('simulated_host_result', {'status' => 'unknown'}).symbolize_keys
      end
      # An empty lane query does not prove a lost pairing failed. No mutation is
      # repeated after a dispatch claim, even when the activation code expires.
      return {status: 'unknown'} if operation.kind == 'retire'
      lane_observation(runtime.client.lane(lane_id: numeric_lane(operation)))
    end

    private

    def runtime
      @runtime ||= Worldpay::TriPosRuntime.new(identity: @identity, profile: @profile)
    end

    def numeric_lane(operation)
      raise BindingError, 'Assigned triPOS lane must be 1–999999' unless operation.lane_id.match?(/\A[1-9][0-9]{0,5}\z/)
      operation.lane_id.to_i
    end

    def lane_observation(response)
      # Lane facts can install only the exact saved nonfinancial assignment.
      # Errors/empty responses never establish pairing or deletion proof.
      return {status: 'unknown'} unless response.is_a?(Hash)
      facts = response[:observations]
      return {status: 'unknown'} unless response[:http_status] == 200 && !response[:transport_failure] && facts.is_a?(Hash) && facts[:has_errors] == false && facts[:error_count] == 0 && facts[:lane_id] && facts[:terminal_id]
      {status: 'succeeded', lane_id: facts[:lane_id], terminal_id: facts[:terminal_id], device_serial: facts[:serial_number],
        device_model: facts[:model_number], device_firmware: facts[:application_version_1],
        connection_state: facts.dig(:connection, :status).to_s.downcase == 'connected' ? 'connected' : 'unknown'}
    end
  end
end
