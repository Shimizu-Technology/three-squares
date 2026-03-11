# frozen_string_literal: true

require "httparty"

# Sends SMS notifications via ClickSend API
# Used for order confirmations, status updates, and admin alerts
class SmsService
  CLICKSEND_API_URL = "https://rest.clicksend.com/v3/sms/send"

  class SmsError < StandardError; end

  class << self
    # Send SMS to customer when order is confirmed
    def send_order_confirmed(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      location_name = order.location&.name || "Three Squares"
      message = if order.fulfillment_type == "shipping"
        "Three Squares: Your order ##{order.order_number} has been confirmed! " \
        "We're preparing it for shipping."
      else
        "Three Squares: Your order ##{order.order_number} has been confirmed! " \
        "We're preparing it now. Pickup at #{location_name}."
      end

      send_sms(to: order.customer_phone, body: message, context: "order_confirmed:#{order.id}")
    end

    # Send SMS to customer when order is ready for pickup
    def send_order_ready(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      location_name = order.location&.name || "Three Squares"
      message = "Three Squares: Your order ##{order.order_number} is READY for pickup " \
                "at #{location_name}! Please pick up at your earliest convenience."

      send_sms(to: order.customer_phone, body: message, context: "order_ready:#{order.id}")
    end

    # Send SMS to customer confirming order placement
    def send_order_confirmation(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      if order.is_pickup_order?
        location_name = order.location&.name || "Three Squares"
        message = "Three Squares: Order ##{order.order_number} received! " \
                  "Total: #{format_price(order.total_cents)} USD. " \
                  "We'll text you when it's ready for pickup at #{location_name}."
      else
        message = "Three Squares: Order ##{order.order_number} received! " \
                  "Total: #{format_price(order.total_cents)} USD. " \
                  "We'll send shipping updates to this number."
      end

      send_sms(to: order.customer_phone, body: message, context: "order_placed:#{order.id}")
    end

    # Send SMS when order is being processed/packed (shipping orders)
    def send_order_processing(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} is now being packed " \
                "and prepared for shipment! We'll send tracking info once it ships."

      send_sms(to: order.customer_phone, body: message, context: "order_processing:#{order.id}")
    end

    # Send SMS when order ships (shipping orders)
    def send_order_shipped(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      tracking = order.tracking_number.present? ? " Tracking: #{order.tracking_number}" : ""
      message = "Three Squares: Your order ##{order.order_number} has shipped!#{tracking} " \
                "We'll notify you when it's delivered."

      send_sms(to: order.customer_phone, body: message, context: "order_shipped:#{order.id}")
    end

    # Send SMS when order is picked up
    def send_order_picked_up(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been picked up. " \
                "Thank you for choosing Three Squares! Enjoy your meal."

      send_sms(to: order.customer_phone, body: message, context: "order_picked_up:#{order.id}")
    end

    # Send SMS when order is delivered
    def send_order_delivered(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been delivered! " \
                "Thank you for choosing Three Squares."

      send_sms(to: order.customer_phone, body: message, context: "order_delivered:#{order.id}")
    end

    # Send SMS when order is cancelled
    def send_order_cancelled(order)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been cancelled. " \
                "If you were charged, a refund will be processed. Questions? Call #{store_phone}."

      send_sms(to: order.customer_phone, body: message, context: "order_cancelled:#{order.id}")
    end

    # Send SMS for refund
    def send_refund_notification(order, refund_amount_cents)
      return skip_result("No customer phone", permanent: true) unless order.customer_phone.present?
      return skip_result("SMS notifications disabled", permanent: !sms_configured?) unless sms_enabled?

      amount = format_price(refund_amount_cents)
      message = "Three Squares: A refund of #{amount} USD has been processed for " \
                "order ##{order.order_number}. Allow 5-10 business days for it to appear."

      send_sms(to: order.customer_phone, body: message, context: "refund:#{order.id}")
    end

    # Send SMS to admin phones when a new order comes in
    def send_admin_new_order(order)
      settings = SiteSetting.instance
      # Admin SMS uses its own toggle — independent of customer SMS setting
      return skip_result("Admin SMS not configured") unless sms_configured? && settings.enable_admin_sms
      admin_phones = settings.admin_sms_phones || []
      return skip_result("No admin SMS phones configured") if admin_phones.empty?

      # Atomic claim: lock the order row, read already-sent phones, and
      # write ALL remaining phones to metadata in one transaction. This
      # prevents two workers from both reading an empty list and both
      # sending to every phone.
      remaining_phones = nil
      order.with_lock do
        already_sent = Array(order.metadata&.dig("admin_sms_sent_phones")).uniq
        remaining_phones = admin_phones - already_sent
        return { success: true, skipped: true } if remaining_phones.empty?

        # Claim all remaining phones upfront — actual sending happens below.
        # with_lock raises on failure, so if we reach past this block the
        # claim is guaranteed persisted.
        meta = order.metadata || {}
        meta["admin_sms_sent_phones"] = (already_sent + remaining_phones).uniq
        order.update_column(:metadata, meta)
      end

      location_name = order.location&.name || "Online"
      source_label = order.source == "pos" ? "POS" : "Online"
      message = "NEW ORDER ##{order.order_number} (#{source_label}) - " \
                "$#{format_price(order.total_cents)} - #{order.customer_name || 'Guest'} " \
                "- #{location_name}"

      # Phones were claimed upfront — now send. On failure, un-claim the
      # failed phone so retry can re-attempt.
      failed = []
      remaining_phones.each do |phone|
        begin
          result = send_sms(to: phone, body: message, context: "admin_new_order:#{order.id}")

          if result.is_a?(Hash) && result[:success]
            # Already claimed in metadata — nothing to update
            Rails.logger.info "[SmsService] Admin SMS sent to #{phone}"
          elsif result&.dig(:skipped)
            # Un-claim skipped phone so it's visible for debugging
            unclaim_admin_phone(order, phone)
            Rails.logger.warn "[SmsService] Admin SMS skipped for #{phone}: #{result[:reason]}"
          else
            unclaim_admin_phone(order, phone)
            failed << phone
          end
        rescue StandardError => e
          # Catch ALL errors (not just SmsError) — HTTP timeouts, Net::OpenTimeout,
          # JSON parse errors, etc. would otherwise leave the phone permanently
          # "claimed" in order metadata with no way to recover except manual DB fix.
          unclaim_admin_phone(order, phone)
          Rails.logger.error "[SmsService] Admin SMS failed for #{phone}: #{e.class}: #{e.message}"
          failed << phone
        end
      end

      if failed.any?
        raise SmsError, "Admin SMS failed for #{failed.length}/#{admin_phones.length} phones: #{failed.join(', ')}"
      end

      { success: true }
    end

    private

    # Customer order SMS (order updates, confirmations, refunds)
    # Single source of truth: enable_order_sms (consolidated toggle).
    # No fallback to legacy flags — if enable_order_sms is false, SMS is off.
    # The migration defaults enable_order_sms to true (via 3-step migration:
    # add as false → migrate from legacy flags → change default to true).
    # Customer SMS toggle — controls order confirmation, status updates, refunds
    def sms_enabled?
      return false unless sms_configured?

      SiteSetting.instance.enable_order_sms
    end


    def sms_configured?
      ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?
    end

    def send_sms(to:, body:, context: nil)
      normalized = normalize_phone(to)
      return skip_result("Invalid phone number: #{to}", permanent: true) unless normalized

      payload = {
        messages: [
          {
            source: "ruby",
            from: "ThreeSQ",
            body: body,
            to: normalized,
            custom_string: context
          }
        ]
      }

      # NOTE: At-least-once delivery. If a network timeout occurs after
      # ClickSend dispatches the SMS but before we read the response,
      # the job raises and retries — potentially sending a duplicate.
      # This is an inherent trade-off with external APIs that don't
      # support pre-dispatch idempotency keys. Acceptable for order
      # notifications (a duplicate "your order is ready" is harmless).
      begin
        response = HTTParty.post(
          CLICKSEND_API_URL,
          basic_auth: {
            username: ENV["CLICKSEND_USERNAME"],
            password: ENV["CLICKSEND_API_KEY"]
          },
          headers: { "Content-Type" => "application/json" },
          body: payload.to_json,
          timeout: 15
        )

        if response.success?
          parsed = response.parsed_response
          msg_data = parsed.dig("data", "messages", 0) || {}
          msg_status = msg_data["status"]&.upcase

          # ClickSend returns HTTP 200 even when the message fails at the
          # carrier level. Check the per-message status field.
          if msg_status.present? && !%w[SUCCESS QUEUED SENT].include?(msg_status)
            Rails.logger.error "[SmsService] ClickSend message-level failure for #{normalized}: status=#{msg_status}"
            raise SmsError, "ClickSend message failed: #{msg_status}"
          end

          Rails.logger.info "[SmsService] SMS sent to #{normalized} (#{context}): status=#{msg_status}"
          { success: true, message_id: msg_data["message_id"], status: msg_status }
        else
          Rails.logger.error "[SmsService] ClickSend error #{response.code}: #{response.body.to_s.truncate(500)}"
          # Raise so job retry_on can re-attempt delivery on transient failures.
          # Previously returned { success: false } which the job treated as success.
          raise SmsError, "ClickSend API error: #{response.code}"
        end
      rescue SmsError
        raise # Already logged above — let job retry_on handle it
      rescue StandardError => e
        Rails.logger.error "[SmsService] Unexpected error sending SMS: #{e.class} - #{e.message}"
        raise
      end
    end

    # Remove a phone from the claimed admin_sms_sent_phones list on failure
    def unclaim_admin_phone(order, phone)
      Order.where(id: order.id).update_all(
        Arel.sql(<<~SQL.squish)
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{admin_sms_sent_phones}',
            (COALESCE(metadata->'admin_sms_sent_phones', '[]'::jsonb) - #{Order.connection.quote(phone)})
          )
        SQL
      )
    end

    def normalize_phone(phone)
      digits = phone.to_s.gsub(/\D/, "")

      case digits.length
      when 7
        # 7-digit numbers are ambiguous — could be Guam local or an
        # incomplete US number. Reject instead of guessing, so customers
        # see a validation error and enter their full number.
        Rails.logger.warn "[SmsService] Rejected 7-digit number #{digits} — requires area code"
        nil
      when 10
        # US/Guam number with area code — prepend +1
        "+1#{digits}"
      when 11
        # Could be US/Guam with country code (1xxx) or international
        "+#{digits}"
      when 12..15
        # International number with country code — assume already complete
        "+#{digits}"
      else
        nil
      end
    end

    def format_price(cents)
      "%.2f" % (cents.to_i / 100.0)
    end

    def store_phone
      SiteSetting.instance.store_phone.presence || "671-646-2652"
    end

    # @param permanent [Boolean] true if this skip will persist across retries
    #   (e.g. missing env vars, feature disabled). Jobs should discard, not retry.
    def skip_result(reason, permanent: false)
      Rails.logger.info "[SmsService] Skipped: #{reason}#{permanent ? ' (permanent)' : ''}"
      { success: false, skipped: true, reason: reason, permanent: permanent }
    end
  end
end
