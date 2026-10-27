# frozen_string_literal: true

module Api
  module V1
    class WorldpayReturnsController < ApplicationController
      # The signed hint is authority only to QUERY this original attempt.
      # Fulfillment still requires the common finalizer's authenticated proof.
      def show
        Payments::Configuration.validate_database!
        attempt = PaymentAttempt.find(params[:attempt_id])
        unless attempt.payment_identity.provider == "worldpay" && attempt.payment_identity.environment != "simulated" &&
            Payments::Worldpay::HostedCheckout.valid_return?(attempt: attempt, token: params[:state],
              validation_code: params[:ValidationCode], setup_id: params[:TransactionSetupID])
          return head :not_found
        end
        Payments::ReconcileAttempt.call(attempt: attempt)
        response.set_header("Cache-Control", "no-store")
        response.set_header("Referrer-Policy", "no-referrer")
        frontend = ENV['FRONTEND_URL']
        return render plain: 'Your order is saved. Return to checkout to check payment status.', status: :accepted if frontend.blank?
        redirect_to "#{frontend.delete_suffix('/')}/checkout", allow_other_host: true, status: :see_other
      rescue ActiveRecord::RecordNotFound, Payments::BindingError
        head :not_found
      rescue Payments::Error, Payments::Configuration::UnsafeConfiguration
        render plain: "Your order is saved. Return to checkout to check payment status.", status: :accepted
      end
    end
  end
end
