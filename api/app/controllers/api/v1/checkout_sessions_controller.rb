# frozen_string_literal: true

module Api
  module V1
    class CheckoutSessionsController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request
      before_action :authenticate_checkout_owner
      before_action { Payments::Configuration.validate_database! }
      rescue_from Payments::Error, Payments::FulfillmentError, Payments::ReserveInventory::Unavailable, CheckoutPricingService::PricingError, ActiveRecord::RecordInvalid, with: :invalid
      rescue_from Payments::Configuration::UnsafeConfiguration, Stripe::StripeError, with: :unavailable
      rescue_from ActiveRecord::RecordNotFound, Payments::BindingError, with: :not_found
      rescue_from Payments::Conflict, with: :conflict

      def create
        session = Payments::CreateCheckout.call(user: current_user, capability: capability, idempotency_key: request.headers["Idempotency-Key"],
          cart_items: cart_items, attributes: checkout_params.to_h)
        attempt = session.payment_attempts.order(:created_at).last
        begin
          Payments::SetupAttempt.call(attempt: attempt)
        rescue Payments::UnsupportedCapability, Payments::Configuration::UnsafeConfiguration, Payments::Conflict, Stripe::StripeError
          # Return the durable intent even when setup is unavailable/unknown,
          # so reload recovery retains its owner and idempotency key.
          return render json: session_json(session, attempt.reload), status: :accepted
        end
        render json: session_json(session, attempt), status: :created
      end

      def show
        session = authorized_session!
        render json: session_json(session, session.payment_attempts.order(:created_at).last)
      end

      def confirm
        session = authorized_session!
        attempt = session.payment_attempts.order(:created_at).last
        # Client references/hints never select which charge is queried or consumed.
        Payments::ReconcileAttempt.call(attempt: attempt)
        attempt.reload
        Payments::SetupAttempt.call(attempt: attempt) if attempt.state == "collecting" && (attempt.raw_provider_id.present? || attempt.setup_id.present?) && attempt.collection_config.blank?
        render json: session_json(session.reload, attempt.reload), status: attempt.order.reload.payment_status == "paid" ? :ok : :accepted
      end

      def cancel
        session = authorized_session!
        attempt = session.payment_attempts.order(:created_at).last
        # Cancellation needs provider proof; it cannot discard an unknown charge.
        Payments::CancelCheckout.call(attempt: attempt)
        render json: session_json(session.reload, attempt.reload), status: :accepted
      end

      def advance_simulation
        session = authorized_session!
        Payments::Simulation::Guard.validate!(session.payment_identity)
        Payments::Simulation::Events.deliver_due(session.payment_identity)
        SimulationClock.for(session.payment_identity).advance!(params.require(:seconds))
        render json: session_json(session.reload, session.payment_attempts.order(:created_at).last)
      end

      # Local simulator only: all authority comes from the saved session, never
      # a supplied order, amount, provider reference or string prefix.
      def simulate
        session = authorized_session!
        Payments::Simulation::Guard.validate!(session.payment_identity)
        attempt = session.payment_attempts.order(:created_at).last
        provider = Payments::ProviderResolver.for_identity(session.payment_identity)
        result = provider.collect(attempt: attempt, scenario: params.require(:scenario), handle: params.require(:handle), mode: params.fetch(:mode, 'token'))
        Payments::FinalizeOrder.call(attempt: attempt, result: result)
        render json: session_json(session.reload, attempt.reload)
      end

      private

      def authenticate_checkout_owner
        # A supplied but invalid identity cannot silently create a guest setup
        # under a different idempotency namespace on a later replay.
        authenticate_request if request.headers['Authorization'].present?
      end

      def authorized_session!
        session = CheckoutSession.find(params[:id])
        raise ActiveRecord::RecordNotFound unless session.authorized?(user: current_user, capability: capability, recovery: true)
        session
      end

      def capability
        request.headers["X-Checkout-Capability"]
      end

      def cart_items
        session_id = request.headers["X-Session-ID"] || request.cookies["session_id"]
        scope = if session_id.present?
          # The browser's anonymous cart can become an authenticated order, but
          # never borrow rows already owned by a different account.
          anonymous = CartItem.where(session_id: session_id, user_id: nil)
          anonymous.exists? || !current_user ? anonymous : current_user.cart_items
        elsif current_user
          current_user.cart_items
        else
          CartItem.none
        end
        scope.includes(product_variant: { product: [:product_locations, :collections] }).order(:id).to_a
      end

      def checkout_params
        params.require(:order).permit(:customer_name, :customer_email, :customer_phone, :email, :phone, :fulfillment_type, :location_id, :notes,
          shipping_address: [:name, :street1, :street2, :city, :state, :zip, :country], shipping_method: [:carrier, :service, :rate_cents, :rate_id], item_special_instructions: {})
      end

      def session_json(session, attempt)
        order = session.order.reload
        identity = session.payment_identity
        client_config = identity.provider == 'stripe' ? {
          'payment_identity_id' => identity.id, 'payment_environment' => identity.environment, 'stripe_account_id' => identity.external_account_id,
          'stripe_publishable_key' => ENV[identity.environment == 'production' ? 'STRIPE_PUBLISHABLE_KEY' : 'STRIPE_PUBLISHABLE_KEY_TEST']
        } : { 'payment_identity_id' => identity.id, 'payment_environment' => identity.environment }
        { id: session.id, attempt_id: attempt.id, state: session.state, payment_state: attempt.state, amount_cents: session.amount_cents, currency: session.currency,
          payment_identity_id: identity.id, provider: session.payment_identity.provider, environment: session.payment_identity.environment, simulated: order.simulated, expires_at: session.expires_at.iso8601,
          flow: attempt.collection_config["flow"], collection_config: collection_active?(session, attempt) ? attempt.collection_config.except("flow").merge(client_config) : {},
          order: { id: order.id, order_number: order.order_number, payment_status: order.payment_status, inventory_committed: order.inventory_committed_at.present? } }
      end

      def collection_active?(session, attempt)
        return false unless session.expires_at.future?
        return attempt.state == "collecting" unless attempt.collection_config["flow"] == "worldpay_hosted_page"
        return false unless %w[collecting unknown].include?(attempt.state) && attempt.approved_cents.zero? && attempt.captured_cents.zero? &&
          !attempt.compensation_claimed_at && !attempt.provider_metadata['worldpay_collection_blocked'] && attempt.last_error != 'Payments::BindingError'
        # Expiry hides collection; it never proves cancellation or permits a
        # replacement setup. Published legacy setup lifetime: ten minutes.
        attempt.dispatched_at.present? && attempt.dispatched_at > 10.minutes.ago
      end

      def not_found(*)
        render json: { error: "Checkout session not found" }, status: :not_found
      end

      def conflict(error)
        render json: { error: error.message }, status: :conflict
      end

      def invalid(error)
        render json: { error: error.message, checkout_rejected_before_intent: error.is_a?(Payments::CheckoutRejected) }, status: :unprocessable_entity
      end

      def unavailable(*)
        render json: { error: "Payment is unavailable. Your order remains saved; payment status can be checked again." }, status: :service_unavailable
      end
    end
  end
end
