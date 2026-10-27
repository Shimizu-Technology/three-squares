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
          render json: {terminals: scope.where(retired_at: nil).includes(:payment_identity, :leased_attempt).map { |terminal| representation(terminal) }}
        end

        def create
          identity = PaymentIdentity.find(params.require(:payment_identity_id))
          Payments::Simulation::Guard.validate!(identity)
          location = Location.find(params.require(:location_id))
          raise Payments::BindingError, 'Location unavailable' if current_user.location_scoped? && current_user.assigned_location_id != location.id
          terminal = PaymentTerminal.create!(payment_identity: identity, location: location, label: params.require(:label),
            lane_id: params.require(:lane_id), terminal_id: params.require(:terminal_id))
          render json: representation(terminal), status: :created
        end

        def status
          terminal = scope.find(params[:id])
          terminal.with_lock { terminal.release_resolved! }
          render json: representation(terminal.reload)
        end

        def collect
          terminal = scope.find(params[:id])
          attempt = PaymentAttempt.find(params.require(:attempt_id))
          authorize_attempt!(attempt)
          Payments::Simulation::Guard.validate!(terminal.payment_identity)
          terminal.reserve!(attempt)
          render json: representation(terminal.reload), status: :accepted
        end

        def simulate
          terminal = scope.find(params[:id])
          Payments::Simulation::Guard.validate!(terminal.payment_identity)
          terminal.with_lock do
            action = params.require(:command)
            if action == 'reconnect' && terminal.leased_attempt_id.nil?
              terminal.update!(status: 'ready')
              next
            end
            expected_id = params[:attempt_id].to_s
            unless terminal.leased_attempt_id == expected_id
              raise Payments::Conflict, 'Reader payment changed. Refresh and select the saved payment before controlling this reader.'
            end
            attempt = terminal.leased_attempt || raise(ActiveRecord::RecordNotFound)
            authorize_attempt!(attempt)
            provider = Payments::ProviderResolver.for_identity(attempt.payment_identity)
            raise Payments::Conflict, 'Reader offline. Reconnect it or cancel the saved payment.' if terminal.status == 'offline' && !%w[reconnect disconnect].include?(action)
            if action == 'reconnect'
              terminal.update!(status: 'waiting_for_card')
            elsif action == 'tap'
              terminal.update!(status: 'card_inserted')
            elsif action == 'disconnect'
              terminal.update!(status: 'offline')
            else
              scenarios = {'approve'=>'approve', 'decline'=>'decline', 'wrong_pin'=>'invalid_pin', 'lose_response'=>'timeout_after_approval'}
              scenario = scenarios.fetch(action) { raise Payments::Error, 'Unsupported reader action' }
              begin
                result = provider.collect(attempt: attempt, handle: provider.collection(attempt: attempt)[:client_secret], scenario: scenario)
                Payments::FinalizeOrder.call(attempt: attempt, result: result)
              rescue Payments::Error => error
                # The local processor transaction may have committed before the
                # response was lost. Commit its evidence before returning error.
                @simulation_error = error
              end
            end
            terminal.release_resolved!
          end
          raise @simulation_error if @simulation_error
          render json: representation(terminal.reload)
        end

        private

        def authorize_attempt!(attempt)
          raise ActiveRecord::RecordNotFound unless attempt.checkout_session.user_id == current_user.id
        end

        def scope
          current_user.location_scoped? ? PaymentTerminal.where(location_id: current_user.assigned_location_id) : PaymentTerminal.all
        end

        def representation(terminal)
          {id: terminal.id, label: terminal.label, location_id: terminal.location_id, lane_id: terminal.lane_id,
            terminal_id: terminal.terminal_id, environment: terminal.payment_identity.environment, provider: terminal.payment_identity.provider,
            status: terminal.status, attempt_id: terminal.leased_attempt_id, order_number: terminal.leased_attempt&.order&.order_number}
        end
        def invalid(error)
          render json: {error: error.message}, status: :unprocessable_entity
        end
        def conflict(error)
          render json: {error: error.message}, status: :conflict
        end
        def not_found(*)
          render json: {error: 'Reader or payment not found'}, status: :not_found
        end
      end
    end
  end
end
