# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PaymentTerminalsController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!
        before_action { Payments::Configuration.validate_database! }
        rescue_from Payments::Error, Payments::Configuration::UnsafeConfiguration, ActiveRecord::RecordInvalid, with: :invalid
        rescue_from Payments::Conflict, with: :conflict
        rescue_from ActiveRecord::RecordNotFound, Payments::BindingError, with: :not_found

        def index
          payload = {terminals: scope.where(retired_at: nil).includes(:payment_identity, :leased_attempt).map { |terminal| representation(terminal) }}
          if staff_access_policy.allowed?('payments.terminals.manage')
            payload[:profiles] = PaymentProfile.where(channel: 'pos', enabled: true).includes(:payment_identity).map do |profile|
              {id: profile.id, provider: profile.provider, environment: profile.payment_identity.environment, location_id: profile.location_id, presentation: profile.presentation}
            end
          end
          render json: payload
        end

        def show
          render json: representation(scope.find(params[:id]))
        end

        def create
          profile = PaymentProfile.find(params.require(:payment_profile_id))
          location = Location.find(params.require(:location_id))
          raise Payments::BindingError, 'Location unavailable' unless staff_access_policy.location_allowed?(location.id)
          result = Payments::ManageTerminal.call(user: current_user, profile: profile, location: location,
            lane_id: params.require(:lane_id), terminal_reference: params.require(:terminal_id), label: params.require(:label),
            activation_code: params[:activation_code], operation_key: request.headers['Idempotency-Key'], kind: 'pair')
          render_administration(result)
        end

        def pair
          terminal = scope.find(params[:id])
          result = Payments::ManageTerminal.call(user: current_user, terminal: terminal, profile: terminal.payment_profile,
            location: terminal.location, lane_id: terminal.lane_id, terminal_reference: terminal.terminal_id, label: terminal.label,
            activation_code: params[:activation_code], operation_key: request.headers['Idempotency-Key'], kind: 'pair')
          render_administration(result)
        end

        def update
          terminal = scope.find(params[:id])
          terminal.with_lock do
            terminal.update!(params.permit(:label, :enabled).to_h)
          end
          render json: representation(terminal)
        end

        def destroy
          terminal = scope.find(params[:id])
          result = Payments::ManageTerminal.call(user: current_user, terminal: terminal, profile: terminal.payment_profile,
            location: terminal.location, lane_id: terminal.lane_id, terminal_reference: terminal.terminal_id, label: terminal.label,
            operation_key: request.headers['Idempotency-Key'], kind: 'retire')
          render_administration(result)
        end

        def status
          terminal = scope.find(params[:id])
          terminal.with_lock { terminal.release_resolved! }
          render json: representation(terminal.reload)
        end

        def collect
          terminal = scope.find(params[:id])
          attempt = PaymentAttempt.find(params.require(:attempt_id))
          authorize_attempt!(attempt, terminal)
          Payments::StartTerminalSale.call(attempt: attempt)
          enqueue_saved_sale(attempt)
          render json: representation(terminal.reload), status: :accepted
        end

        def cancel
          terminal = scope.find(params[:id])
          attempt = PaymentAttempt.find(params.require(:attempt_id))
          authorize_attempt!(attempt, terminal)
          Payments::CancelCheckout.call(attempt: attempt)
          render json: representation(terminal.reload), status: :accepted
        end

        def advance_simulation
          terminal = scope.find(params[:id])
          attempt = PaymentAttempt.find(params.require(:attempt_id))
          authorize_attempt!(attempt, terminal)
          Payments::Simulation::Guard.validate!(terminal.payment_identity)
          SimulationClock.for_attempt(attempt).advance!(params.require(:seconds))
          render json: representation(terminal.reload)
        end

        def simulate
          terminal = scope.find(params[:id])
          Payments::Simulation::Guard.validate!(terminal.payment_identity)
          action = params.require(:command)
          if action == 'reconnect' && params[:attempt_id].blank?
            terminal.with_lock do
              terminal.release_resolved!
              raise Payments::Conflict, 'Reader still has an unresolved payment. Check that saved payment.' if terminal.leased_attempt_id
              terminal.update!(status: 'ready', connection_state: 'connected', connection_verified_at: Time.current)
            end
            return render json: representation(terminal.reload)
          end
          attempt = PaymentAttempt.find(params.require(:attempt_id))
          authorize_attempt!(attempt, terminal)
          scenario = {'approve' => 'approve', 'decline' => 'decline', 'wrong_pin' => 'invalid_pin', 'lose_response' => 'timeout_after_approval'}[action]
          token = nil
          Payments::AttemptLock.call(attempt) do |session, current, _, order|
            Payments::AttemptLock.validate!(session, current, order)
            terminal.lock!
            terminal.release_resolved!
            raise Payments::Conflict, 'Reader payment changed. Refresh the saved payment.' unless terminal.leased_attempt_id == current.id
            raise Payments::Conflict, 'Reader is processing. Check the saved payment before collecting again.' if terminal.command_token
            if terminal.status == 'offline' && !%w[reconnect disconnect].include?(action)
              raise Payments::Conflict, 'Reader offline. Reconnect it or cancel the saved payment.'
            end
            case action
            when 'reconnect' then terminal.update!(status: 'waiting_for_card', connection_state: 'connected', connection_verified_at: Time.current)
            when 'tap' then terminal.update!(status: 'card_inserted')
            when 'disconnect' then terminal.update!(status: 'offline', connection_state: 'offline', connection_verified_at: Time.current)
            else
              raise Payments::Error, 'Unsupported reader action' unless scenario
              raise Payments::Conflict, 'Take the saved payment first' unless current.dispatched_at
              token = SecureRandom.uuid
              terminal.update!(command_token: token, command_claimed_at: Time.current, status: 'processing')
            end
          end
          if token
            provider = Payments::ProviderResolver.for_attempt(attempt.reload)
            result = provider.collect(attempt: attempt, handle: provider.collection(attempt: attempt)[:client_secret], scenario: scenario)
            Payments::FinalizeOrder.call(attempt: attempt, result: result)
          end
          Payments::TerminalLease.release_resolved(attempt)
          render json: representation(terminal.reload)
        end

        private

        def enqueue_saved_sale(attempt)
          effect = PaymentOutbox.find_by(effect_key: "attempt:#{attempt.id}:terminal_sale")
          Payments::DispatchOutbox.call(outbox: effect) if effect
        rescue StandardError => error
          Rails.logger.error("Terminal enqueue attempt=#{attempt.id} error=#{error.class}")
        end

        def authorize_attempt!(attempt, terminal)
          unless attempt.checkout_session.user_id == current_user.id && attempt.payment_terminal_id == terminal.id &&
              staff_access_policy.location_allowed?(attempt.order.location_id)
            raise ActiveRecord::RecordNotFound
          end
        end

        def scope = staff_scope(PaymentTerminal.all)

        def render_administration(operation)
          terminal = operation.payment_terminal
          render json: {administration: {id: operation.id, state: operation.state, kind: operation.kind,
            error: operation.error_classification}, terminal: terminal && representation(terminal)},
            status: operation.state == 'succeeded' ? :ok : :accepted
        end

        def representation(terminal)
          {id: terminal.id, label: terminal.label, location_id: terminal.location_id, lane_id: terminal.lane_id,
            terminal_id: terminal.terminal_id, payment_profile_id: terminal.payment_profile_id, enabled: terminal.enabled, collectable: collectable?(terminal),
            environment: terminal.payment_identity.environment, provider: terminal.payment_identity.provider,
            connection_state: terminal.connection_state, connection_verified_at: terminal.connection_verified_at,
            device_serial: terminal.device_serial, device_model: terminal.device_model, device_firmware: terminal.device_firmware,
            status: terminal.status, collection_ready: terminal.leased_attempt&.dispatched_at.present?, attempt_id: terminal.leased_attempt_id, order_number: terminal.leased_attempt&.order&.order_number}
        end
        def collectable?(terminal)
          @collection_profiles ||= {}
          key = terminal.location_id
          profile = if @collection_profiles.key?(key)
            @collection_profiles[key]
          else
            @collection_profiles[key] = Payments::ProviderResolver.profile!(location_id: key, channel: 'pos')
          end
          terminal.enabled? && !terminal.retired_at && profile.payment_identity_id == terminal.payment_identity_id &&
            (!terminal.payment_profile_id || terminal.payment_profile_id == profile.id)
        rescue Payments::Error, Payments::Configuration::UnsafeConfiguration
          false
        end

        def invalid(error) = render(json: {error: error.message}, status: :unprocessable_entity)
        def conflict(error) = render(json: {error: error.message}, status: :conflict)
        def not_found(*) = render(json: {error: 'Reader or payment not found'}, status: :not_found)
      end
    end
  end
end
