# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PaymentReconciliationController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!
        before_action { Payments::Configuration.validate_environment! }
        rescue_from Payments::Error, Payments::Configuration::UnsafeConfiguration, Payments::Reconciliation::CanonicalCSV::Invalid, ActiveRecord::RecordInvalid, with: :invalid
        rescue_from Payments::Conflict, with: :conflict
        rescue_from ActiveRecord::RecordNotFound, Payments::BindingError, with: :not_found

        def index
          choices = identities
          selected = params[:identity_id].present? ? choices.find(params[:identity_id]) : choices.first
          report = if selected
            day = Time.current.in_time_zone("Pacific/Guam").to_date
            Payments::Reconciliation::Report.call(identity: selected, user: current_user, from: params[:from] || (day - 29).iso8601,
              to: params[:to] || day.iso8601, location_id: params[:location_id])
          end
          render json: { accounts: choices.map { |i| Payments::Reconciliation::Report.identity_json(i) }, report: report }
        end

        def show
          batch = SettlementBatch.find_by!(payment_identity: identity, id: params[:id])
          items = batch.settlement_items.order(:occurred_at, :id).limit(1001).to_a
          allocations = batch.funding_allocations.order(:created_at, :id).limit(1001).to_a
          render json: { batch: Payments::Reconciliation::Report.batch_json(batch, batch.funding_allocations.sum(:amount_cents)),
            items: items.first(1000).map { |i| i.attributes.slice("id", "external_id", "entry_type", "amount_cents", "transaction_id", "original_reference",
              "occurred_at", "provider_local_time", "provider_offset", "business_date", "location_id", "terminal_id") },
            allocations: allocations.first(1000).map { |a| a.attributes.slice("id", "external_id", "funding_deposit_id", "amount_cents", "reason") },
            truncated: items.size > 1000 || allocations.size > 1000 }
        end

        def import
          result = Payments::Reconciliation::Import.call(identity: identity, user: current_user, input: params.require(:csv), operation_key: request.headers["Idempotency-Key"])
          render json: Payments::Reconciliation::Report.import_json(result)
        end

        def import_status
          saved = ReconciliationImport.find_by!(payment_identity: identity, operation_key: params.require(:operation_key), user: current_user)
          render json: Payments::Reconciliation::Report.import_json(saved)
        end

        def export
          send_data Payments::Reconciliation::Report.export(identity: identity, user: current_user), type: "text/csv", disposition: "attachment", filename: "payment-reconciliation.csv"
        end

        def allocate
          selected = identity
          result = Payments::Reconciliation::Allocate.call(identity: selected, user: current_user,
            batch: SettlementBatch.find_by!(payment_identity: selected, id: params.require(:batch_id)),
            deposit: FundingDeposit.find_by!(payment_identity: selected, id: params.require(:deposit_id)),
            amount_cents: params.require(:amount_cents), reason: params.require(:reason), operation_key: request.headers["Idempotency-Key"])
          render json: { id: result.id, amount_cents: result.amount_cents }
        end

        def review
          selected = identity
          ReconciliationException.transaction do
            Payments::Reconciliation::Access.lock!(selected)
            exception = ReconciliationException.lock.find_by!(payment_identity: selected, id: params.require(:id))
            reason = Payments::Reconciliation::Access.reason!(params.require(:reason))
            if exception.state == "reviewed"
              raise Payments::Conflict, "Exception was already reviewed with another reason" unless exception.reviewed_by_id == current_user.id && exception.review_reason == reason
            else
              exception.update!(state: "reviewed", reviewed_by: current_user, review_reason: reason, reviewed_at: Time.current)
              Payments::Reconciliation::Access.audit!(identity: selected, user: current_user, subject: exception, event: "exception_reviewed", reason: reason)
            end
            render json: Payments::Reconciliation::Report.exception_json(exception)
          end
        end

        def simulate_close
          result = Payments::Reconciliation::SimulateClose.call(identity: identity, user: current_user, operation_key: request.headers["Idempotency-Key"],
            scenario: params.require(:scenario), lag_days: params.fetch(:lag_days, 2), fee_cents: params.fetch(:fee_cents, 0))
          render json: Payments::Reconciliation::Report.import_json(result)
        end

        def advance_simulation
          result = Payments::Reconciliation::SimulateClose.advance(identity: identity, user: current_user,
            seconds: params.require(:seconds), operation_key: request.headers["Idempotency-Key"])
          render json: { accounting_time: result.now.iso8601 }
        end

        def simulated_funding
          selected = identity
          saved = ReconciliationImport.find_by!(payment_identity: selected, id: params.require(:import_id))
          send_data Payments::Reconciliation::SimulateClose.funding_export(identity: selected, user: current_user, import: saved),
            type: "text/csv", disposition: "attachment", filename: "simulated-funding.csv"
        end

        def simulate_void
          selected = identity
          Payments::Simulation::Guard.validate!(selected)
          attempt = PaymentAttempt.find_by!(payment_identity: selected, id: params.require(:attempt_id))
          result = Payments::RefundPayment.call(order: attempt.order, amount_cents: attempt.requested_cents,
            request_key: request.headers["Idempotency-Key"], admin_user: current_user, reason: "Simulated full current-batch void",
            restoration_request: { "restock_items" => false }, kind: "void")
          render json: result.except(:refund).merge(refund_id: result[:refund]&.id), status: result.fetch(:http_status)
        end

        private

        def identities
          environment = params.fetch(:environment, "production")
          raise ActiveRecord::RecordNotFound unless %w[production sandbox simulated].include?(environment)
          if Payments::Configuration.production? && environment != "production"
            raise ActiveRecord::RecordNotFound
          end
          if environment == "simulated"
            raise ActiveRecord::RecordNotFound unless staff_access_policy.allowed?("payments.simulate")
            raise ActiveRecord::RecordNotFound unless ENV["PAYMENTS_SIMULATION_ENABLED"] == "true"
          end
          PaymentIdentity.where(environment: environment, currency: "USD").order(:provider, :external_account_id, :id)
        end

        def identity
          @identity ||= Payments::Reconciliation::Access.check!(user: current_user, identity: identities.find(params.require(:identity_id)))
        end
        def invalid(error) = render(json: { error: error.message }, status: :unprocessable_entity)
        def conflict(error) = render(json: { error: error.message }, status: :conflict)
        def not_found(_error) = render(json: { error: "Accounting record unavailable" }, status: :not_found)
      end
    end
  end
end
