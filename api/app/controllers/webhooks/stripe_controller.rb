# frozen_string_literal: true

module Webhooks
  class StripeController < ApplicationController
    # Stripe sends raw JSON — we need the raw body for signature verification.
    # No authentication needed — webhooks come from Stripe, not users.
    # CSRF is already disabled (Rails API-only app).
    before_action :set_raw_body

    # POST /webhooks/stripe
    def create
      event = verify_and_construct_event
      return head :bad_request unless event

      handle_event(event)

      head :ok
    end

    private

    # ── Signature Verification ──────────────────────────────────────

    def set_raw_body
      @raw_body = request.body.read
    end

    def verify_and_construct_event
      webhook_secret = ENV["STRIPE_WEBHOOK_SECRET"]

      if webhook_secret.blank?
        if Rails.env.production?
          Rails.logger.error "❌ Stripe webhook secret missing in production; rejecting webhook"
          return nil
        end
        Rails.logger.warn "⚠️  Stripe webhook signature verification SKIPPED (no webhook secret configured)"
        return parse_unverified_event
      end

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
      when "charge.dispute.created"
        handle_charge_dispute_created(event.data.object)
      else
        Rails.logger.info "ℹ️  Stripe webhook received unhandled event: #{event.type}"
      end
    end

    # ── Event Handlers ──────────────────────────────────────────────

    def handle_payment_intent_succeeded(payment_intent)
      target = find_payment_target(payment_intent)
      return unless target
      record = target[:record]

      if record.payment_status == "paid"
        Rails.logger.info "ℹ️  #{target[:type]} ##{record.id} already marked as paid — skipping duplicate webhook"
        return
      end

      # Use update_column to bypass validations — webhooks should always succeed
      # regardless of model validation state (e.g., missing optional fields).
      record.update_column(:payment_status, "paid")
      Rails.logger.info "✅ #{target[:type]} ##{record.id} payment_status updated to 'paid' via Stripe webhook"

      if target[:type] == "Order"
        # Only send email if enabled — SMS already sent in checkout flow
        if SiteSetting.instance.enable_order_emails && record.customer_email.present?
          SendOrderConfirmationEmailJob.perform_later(record.id)
          Rails.logger.info "📧 Order confirmation email enqueued for Order ##{record.id}"
        end
      end
    rescue StandardError => e
      Rails.logger.error "❌ Failed to update payment target ##{record&.id}: #{e.message}"
    end

    def handle_payment_intent_failed(payment_intent)
      target = find_payment_target(payment_intent)
      return unless target
      record = target[:record]

      # Use update_column to bypass validations — webhook updates must not fail
      # due to unrelated validation issues on the order model.
      record.update_column(:payment_status, "failed")
      Rails.logger.error "❌ Payment failed for #{target[:type]} ##{record.id} (payment_intent: #{payment_intent.id})"

      # Log the failure reason if available
      if payment_intent.respond_to?(:last_payment_error) && payment_intent.last_payment_error
        Rails.logger.error "   Failure reason: #{payment_intent.last_payment_error.message}"
      end
    rescue StandardError => e
      Rails.logger.error "❌ Failed to update payment target ##{record&.id}: #{e.message}"
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

      # Use update_column to bypass validations — webhook updates must not fail
      record.update_column(:payment_status, "refunded")
      Rails.logger.info "💸 #{target[:type]} ##{record.id} payment_status updated to 'refunded' via Stripe webhook"

      # Create a Refund record + notify the customer for Dashboard-initiated refunds.
      # Admin-panel refunds already create Refund records in orders_controller#refund,
      # so we check stripe_refund_id to avoid duplicates.
      if record.is_a?(Order)
        stripe_refund = charge.respond_to?(:refunds) ? charge.refunds&.data&.first : nil
        stripe_refund_id = stripe_refund&.id

        if stripe_refund_id.present? && !Refund.exists?(stripe_refund_id: stripe_refund_id)
          refund = Refund.create!(
            order: record,
            amount_cents: stripe_refund.amount,
            reason: stripe_refund.reason || "Refunded via Stripe Dashboard",
            status: "completed",
            stripe_refund_id: stripe_refund_id
          )
          SendRefundNotificationJob.perform_later(refund.id)
          Rails.logger.info "📧 Enqueued refund notification for Stripe Dashboard refund #{stripe_refund_id}"
        end
      end
    rescue StandardError => e
      Rails.logger.error "❌ Failed to update payment target ##{record&.id} for refund: #{e.message}"
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
