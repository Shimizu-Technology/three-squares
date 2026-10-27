# frozen_string_literal: true

module Webhooks
  class StripeController < ApplicationController
    before_action { Payments::Configuration.validate_database! }
    # Stripe sends raw JSON — we need the raw body for signature verification.
    # No authentication needed — webhooks come from Stripe, not users.
    # CSRF is already disabled (Rails API-only app).
    before_action :set_raw_body

    # POST /webhooks/stripe
    def create
      event = verify_and_construct_event
      return head :bad_request unless event

      @event_id = event.id
      @event_account = event.respond_to?(:account) ? event.account : nil
      @event_account ||= ENV["STRIPE_WEBHOOK_ACCOUNT_ID"]
      environment = event.livemode ? "production" : "sandbox"
      @event_identities = PaymentIdentity.where(provider: 'stripe', external_account_id: @event_account, environment: environment)
      object = event.data.object.to_h.deep_stringify_keys
      identity = if event.type.start_with?('payment_intent.')
        candidate = PaymentAttempt.find_by(id: object.fetch('metadata', {})['payment_attempt_id'])&.payment_identity
        candidate if candidate && @event_identities.exists?(id: candidate.id)
      elsif %w[refund.created refund.updated refund.failed charge.refund.updated].include?(event.type)
        refund_identity(object)
      elsif event.type == 'charge.refunded'
        charge_identity(object)
      elsif @event_identities.one?
        @event_identities.first
      end
      Payments::Configuration.validate_identity!(identity) if identity
      receipt = PaymentEvent.create_or_find_by!(provider: "stripe", external_account_id: @event_account.to_s, environment: environment, external_event_id: event.id) do |row|
        row.payment_identity = identity
        row.payload_digest = Digest::SHA256.hexdigest(@raw_body)
        row.facts = { "type" => event.type, "object_id" => event.data.object.id }
      end
      raise Payments::BindingError, "Event payload changed" unless receipt.payload_digest == Digest::SHA256.hexdigest(@raw_body)
      return head :ok if receipt.processed_at
      @event_identity = identity
      handle_event(event)
      receipt.update!(processed_at: Time.current)
      head :ok
    rescue Payments::BindingError, Payments::Configuration::UnsafeConfiguration => error
      Rails.logger.warn("Rejected Stripe event: #{error.class}: #{error.message}")
      head :unprocessable_entity
    end

    private

    # ── Signature Verification ──────────────────────────────────────

    def set_raw_body
      @raw_body = request.body.read
    end

    def verify_and_construct_event
      webhook_secret = ENV["STRIPE_WEBHOOK_SECRET"]

      return nil if webhook_secret.blank?

      verify_stripe_signature(webhook_secret)
    rescue Stripe::SignatureVerificationError => e
      Rails.logger.error "❌ Stripe webhook signature verification failed: #{e.message}"
      nil
    rescue JSON::ParserError => e
      Rails.logger.error "❌ Stripe webhook JSON parse error: #{e.message}"
      nil
    end

    def parse_unverified_event
      data = JSON.parse(@raw_body)
      Stripe::Event.construct_from(data)
    rescue JSON::ParserError => e
      Rails.logger.error "❌ Stripe webhook JSON parse error: #{e.message}"
      nil
    end

    def verify_stripe_signature(webhook_secret)
      sig_header = request.env["HTTP_STRIPE_SIGNATURE"]
      Stripe::Webhook.construct_event(@raw_body, sig_header, webhook_secret)
    end

    # ── Event Routing ───────────────────────────────────────────────

    def handle_event(event)
      case event.type
      when "payment_intent.succeeded"
        handle_payment_intent_succeeded(event.data.object)
      when "payment_intent.payment_failed"
        handle_payment_intent_failed(event.data.object)
      when "charge.refunded"
        handle_charge_refunded(event.data.object)
      when "charge.refund.updated", "refund.created", "refund.updated", "refund.failed"
        handle_charge_refund_updated(event.data.object)
      when "charge.dispute.created"
        handle_charge_dispute_created(event.data.object)
      else
        Rails.logger.info "ℹ️  Stripe webhook received unhandled event: #{event.type}"
      end
    end

    # ── Event Handlers ──────────────────────────────────────────────

    def handle_payment_intent_succeeded(payment_intent)
      reconcile_intent(payment_intent)
    end

    def handle_payment_intent_failed(payment_intent)
      # Re-query authenticated financial truth; a late failure never overwrites capture.
      reconcile_intent(payment_intent)
    end

    def reconcile_intent(payment_intent)
      attempt_id = payment_intent.metadata.to_h.stringify_keys["payment_attempt_id"]
      attempt = PaymentAttempt.find_by(id: attempt_id)
      return unless attempt
      identity = attempt.payment_identity
      raise Payments::BindingError, "Webhook environment mismatch" unless @event_identity&.id == identity.id
      raise Payments::BindingError, "Webhook account mismatch" unless @event_account.to_s == identity.external_account_id.to_s
      provider = Payments::ProviderResolver.for_identity(identity)
      provider.validate_binding!(payment_intent, attempt)
      Payments::ReconcileAttempt.call(attempt: attempt)
    end

    def handle_charge_refunded(charge)
      fields = charge.to_h.deep_stringify_keys
      references = [charge.id, fields['payment_intent']].compact
      # Charge listing is an authenticated account read; each financial update
      # below independently resolves and validates its original operation identity.
      query_identity = @event_identity || charge_identity(fields)
      raise Payments::BindingError, 'Unknown refund account identity' unless query_identity
      refunds = charge.respond_to?(:refunds) ? charge.refunds : nil
      rows = refunds&.respond_to?(:data) ? refunds.data : []
      more = refunds.nil? || (refunds.respond_to?(:has_more) && refunds.has_more)
      loop do
        rows.each { |refund| apply_refund(refund, references) }
        break unless more
        params = { charge: charge.id, limit: 100 }
        params[:starting_after] = rows.last.id if rows.any?
        page = Payments::ProviderResolver.for_identity(query_identity).client.v1.refunds.list(params)
        raise Payments::BindingError, 'Invalid refund pagination' if page.has_more && page.data.empty?
        rows = page.data
        more = page.has_more
      end
    end

    def handle_charge_refund_updated(refund)
      fields = refund.to_h.deep_stringify_keys
      apply_refund(refund, [fields['payment_intent'], fields['charge']].compact)
    end

    def apply_refund(refund, original_references)
      identity = refund_identity(refund.to_h.deep_stringify_keys)
      raise Payments::BindingError, 'Uncorrelated refund; reconciliation required' unless identity
      operation = Payments::StripeRefundEvent.call(identity: identity, event_id: @event_id,
        refund: refund, original_references: original_references)
      Payments::DispatchRefundEffects.call(operation: operation, restore_now: true)
    end

    def charge_identity(fields)
      references = [fields['id'], fields['payment_intent']].compact
      ids = PaymentTransaction.where(payment_identity_id: @event_identities.select(:id), raw_provider_id: references)
        .where.not(order_id: nil).distinct.pluck(:payment_identity_id)
      ids |= RefundOperation.where(payment_identity_id: @event_identities.select(:id), original_reference: references).distinct.pluck(:payment_identity_id)
      return PaymentIdentity.find(ids.first) if ids.one?
      first_refund = fields.dig('refunds', 'data')&.first
      refund_identity(first_refund) if first_refund
    end

    def refund_identity(fields)
      scope = RefundOperation.where(payment_identity_id: @event_identities.select(:id))
      operation_id = fields.fetch('metadata', {})['refund_operation_id']
      operation = scope.find_by(id: operation_id) if operation_id.present?
      unless operation
        matches = scope.where(raw_provider_id: fields['id']).limit(2).to_a
        raise Payments::BindingError, 'Ambiguous refund identity' if matches.size > 1
        operation = matches.first
      end
      operation&.payment_identity
    end

    def handle_charge_dispute_created(dispute)
      Rails.logger.warn "⚠️  Charge dispute created: #{dispute.id} — manual review required"
      # Future: notify admin via SendAdminNotificationEmailJob or Slack
    end

  end
end
