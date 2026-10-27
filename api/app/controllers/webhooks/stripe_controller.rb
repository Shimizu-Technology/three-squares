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

      @event_account = event.respond_to?(:account) ? event.account : nil
      @event_account ||= ENV["STRIPE_WEBHOOK_ACCOUNT_ID"]
      environment = event.livemode ? "production" : "sandbox"
      identity = PaymentIdentity.find_by(provider: "stripe", external_account_id: @event_account, environment: environment)
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
      when "charge.refund.updated"
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
      # Find order by payment_intent_id from the charge
      payment_intent_id = charge.respond_to?(:payment_intent) ? charge.payment_intent : nil
      target = find_payment_target_from_intent_id(payment_intent_id)

      unless target
        Rails.logger.warn "⚠️  Received charge.refunded but could not find order (charge: #{charge.id}, payment_intent: #{payment_intent_id})"
        return
      end
      record = target[:record]

      # Only mark as "refunded" when fully refunded. Partial refunds from
      # the Stripe Dashboard should NOT flip payment_status — can_refund?
      # gates on payment_status == "paid", so a premature flip permanently
      # blocks follow-up refunds from the admin panel.
      amount_refunded = charge.respond_to?(:amount_refunded) ? charge.amount_refunded.to_i : 0
      amount_total = charge.respond_to?(:amount) ? charge.amount.to_i : 0

      # Use == not >= to avoid marking over-refunds (Stripe edge case) as
      # fully refunded. Over-refunds should be flagged for manual review.
      if amount_total > 0 && amount_refunded == amount_total
        record.update_column(:payment_status, "refunded")
        Rails.logger.info "💸 #{target[:type]} ##{record.id} fully refunded — payment_status set to 'refunded'"
      elsif amount_refunded > amount_total
        Rails.logger.warn "⚠️ #{target[:type]} ##{record.id} OVER-REFUNDED ($#{amount_refunded / 100.0} > $#{amount_total / 100.0}) — manual review required"
      else
        Rails.logger.info "💸 #{target[:type]} ##{record.id} partially refunded ($#{amount_refunded / 100.0} / $#{amount_total / 100.0}) — payment_status stays '#{record.payment_status}'"
      end

      # Create a Refund record + notify the customer for Dashboard-initiated refunds.
      # Admin-panel refunds already create Refund records in orders_controller#refund,
      # so we check stripe_refund_id to avoid duplicates.
      # Process ALL refunds in the charge, not just the first.
      # Concurrent partial refunds or future Stripe API changes could include
      # multiple refund objects in a single charge.refunded event.
      if record.is_a?(Order)
        stripe_refunds = charge.respond_to?(:refunds) ? Array(charge.refunds&.data) : []
        stripe_refunds.each do |stripe_refund|
          next if stripe_refund.id.blank?

          # Map the actual Stripe refund status instead of hardcoding "succeeded".
          # Stripe refunds can be "pending" when charge.refunded fires (card-network
          # settlement takes days). Our model accepts: pending, succeeded, failed.
          mapped_status = %w[pending succeeded failed].include?(stripe_refund.status) ?
                          stripe_refund.status : "pending"

          # Upsert pattern: create if new, find if already exists.
          # Separating create from perform_later ensures that on Stripe retry
          # (e.g., Redis was down on first attempt), the existing Refund record
          # is found and the notification is still enqueued.
          refund = begin
            Refund.create!(
              stripe_refund_id: stripe_refund.id,
              order: record,
              amount_cents: stripe_refund.amount,
              reason: stripe_refund.reason || "Refunded via Stripe Dashboard",
              status: mapped_status
            )
          rescue ActiveRecord::RecordNotUnique
            # Another webhook delivery already created this refund — find it
            Refund.find_by(stripe_refund_id: stripe_refund.id)
          end

          # Always attempt notification — the job's own email_sent/sms_sent
          # idempotency columns prevent duplicate sends.
          if refund
            SendRefundNotificationJob.perform_later(refund.id)
            Rails.logger.info "📧 Enqueued refund notification for Stripe Dashboard refund #{stripe_refund.id}"
          end
        end
      end
    rescue ActiveRecord::RecordNotFound => e
      # Order not found — log and return 200 (Stripe retrying won't help)
      Rails.logger.error "❌ Refund webhook: record not found — #{e.message}"
    rescue StandardError => e
      # DB failures, job queue errors — re-raise so Stripe gets a 500
      # and retries the webhook. Swallowing these silently loses refund
      # notifications permanently.
      Rails.logger.error "❌ Refund webhook failed for ##{record&.id}: #{e.message}"
      raise
    end

    def handle_charge_refund_updated(stripe_refund)
      refund = Refund.find_by(stripe_refund_id: stripe_refund.id)
      unless refund
        Rails.logger.info "ℹ️  charge.refund.updated for unknown refund #{stripe_refund.id} — skipping"
        return
      end

      new_status = %w[pending succeeded failed].include?(stripe_refund.status) ?
                   stripe_refund.status : refund.status

      return if refund.status == new_status

      old_status = refund.status

      # Update status BEFORE enqueuing the notification job. A fast Sidekiq
      # worker could pick up the job and check refund.pending? before the DB
      # write commits — that would silently skip the notification with no
      # retry. The per-refund email_sent/sms_sent idempotency columns already
      # protect against duplicates on Stripe webhook retries if enqueue fails.
      refund.update_column(:status, new_status)
      Rails.logger.info "💸 Refund #{stripe_refund.id} status: #{old_status} → #{new_status}"

      if new_status == "succeeded" && old_status == "pending"
        SendRefundNotificationJob.perform_later(refund.id)
        Rails.logger.info "📧 Enqueued refund notification for settled refund #{stripe_refund.id}"
      end
    rescue StandardError => e
      Rails.logger.error "❌ charge.refund.updated failed for #{stripe_refund.id}: #{e.message}"
      raise
    end

    def handle_charge_dispute_created(dispute)
      Rails.logger.warn "⚠️  Charge dispute created: #{dispute.id} — manual review required"
      # Future: notify admin via SendAdminNotificationEmailJob or Slack
    end

    # ── Helpers ──────────────────────────────────────────────────────

    def find_payment_target(payment_intent)
      # First try: find by metadata.order_id (set when creating the payment intent)
      order_id = payment_intent.respond_to?(:metadata) && payment_intent.metadata.respond_to?(:order_id) ?
                 payment_intent.metadata.order_id : nil

      order = Order.find_by(id: order_id) if order_id.present?
      return { type: "Order", record: order } if order

      # Fallback: find by payment_intent_id stored on the order
      order = Order.find_by(payment_intent_id: payment_intent.id) if payment_intent.id.present?
      return { type: "Order", record: order } if order

      Rails.logger.warn "⚠️  Could not find payment target for payment_intent #{payment_intent.id} (metadata.order_id: #{order_id})"
      nil
    end

    def find_payment_target_from_intent_id(payment_intent_id)
      return nil if payment_intent_id.blank?

      order = Order.find_by(payment_intent_id: payment_intent_id)
      return { type: "Order", record: order } if order

      nil
    end
  end
end
