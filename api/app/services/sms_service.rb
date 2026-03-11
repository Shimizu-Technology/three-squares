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
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      location_name = order.location&.name || "Three Squares"
      message = "Three Squares: Your order ##{order.order_number} has been confirmed! " \
                "We're preparing it now. Pickup at #{location_name}."

      send_sms(to: order.customer_phone, body: message, context: "order_confirmed:#{order.id}")
    end

    # Send SMS to customer when order is ready for pickup
    def send_order_ready(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      location_name = order.location&.name || "Three Squares"
      message = "Three Squares: Your order ##{order.order_number} is READY for pickup " \
                "at #{location_name}! Please pick up at your earliest convenience."

      send_sms(to: order.customer_phone, body: message, context: "order_ready:#{order.id}")
    end

    # Send SMS to customer confirming order placement
    def send_order_confirmation(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

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
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} is now being packed " \
                "and prepared for shipment! We'll send tracking info once it ships."

      send_sms(to: order.customer_phone, body: message, context: "order_processing:#{order.id}")
    end

    # Send SMS when order ships (shipping orders)
    def send_order_shipped(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      tracking = order.tracking_number.present? ? " Tracking: #{order.tracking_number}" : ""
      message = "Three Squares: Your order ##{order.order_number} has shipped!#{tracking} " \
                "We'll notify you when it's delivered."

      send_sms(to: order.customer_phone, body: message, context: "order_shipped:#{order.id}")
    end

    # Send SMS when order is picked up
    def send_order_picked_up(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been picked up. " \
                "Thank you for choosing Three Squares! Enjoy your meal."

      send_sms(to: order.customer_phone, body: message, context: "order_picked_up:#{order.id}")
    end

    # Send SMS when order is delivered
    def send_order_delivered(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been delivered! " \
                "Thank you for choosing Three Squares."

      send_sms(to: order.customer_phone, body: message, context: "order_delivered:#{order.id}")
    end

    # Send SMS when order is cancelled
    def send_order_cancelled(order)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      message = "Three Squares: Your order ##{order.order_number} has been cancelled. " \
                "If you were charged, a refund will be processed. Questions? Call #{store_phone}."

      send_sms(to: order.customer_phone, body: message, context: "order_cancelled:#{order.id}")
    end

    # Send SMS for refund
    def send_refund_notification(order, refund_amount_cents)
      return skip_result("No customer phone") unless order.customer_phone.present?
      return skip_result("SMS notifications disabled") unless sms_enabled?

      amount = format_price(refund_amount_cents)
      message = "Three Squares: A refund of #{amount} USD has been processed for " \
                "order ##{order.order_number}. Allow 5-10 business days for it to appear."

      send_sms(to: order.customer_phone, body: message, context: "refund:#{order.id}")
    end

    # Send SMS to admin phones when a new order comes in
    def send_admin_new_order(order)
      return skip_result("SMS not configured") unless ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?
      settings = SiteSetting.instance
      return skip_result("SMS notifications disabled") unless admin_sms_enabled?
      admin_phones = settings.admin_sms_phones || []
      return skip_result("No admin SMS phones configured") if admin_phones.empty?

      location_name = order.location&.name || "Online"
      source_label = order.source == "pos" ? "POS" : "Online"
      message = "NEW ORDER ##{order.order_number} (#{source_label}) - " \
                "$#{format_price(order.total_cents)} - #{order.customer_name || 'Guest'} " \
                "- #{location_name}"

      # Send to each phone individually with per-phone error handling.
      # If send_sms raises (non-2xx), catch it so we don't re-send to
      # phones that already received the message on job retry.
      results = admin_phones.map do |phone|
        begin
          send_sms(to: phone, body: message, context: "admin_new_order:#{order.id}")
        rescue SmsError => e
          Rails.logger.error "[SmsService] Admin SMS failed for #{phone}: #{e.message}"
          { success: false, error: e.message, phone: phone }
        end
      end

      failed = results.select { |r| !r[:success] }
      # Raise if ANY phone failed so the job retries. Note: on retry,
      # send_admin_new_order is called again from scratch, which re-sends
      # to ALL phones (including already-successful ones). This is acceptable
      # for admin alerts — a duplicate "new order" SMS is low-impact.
      if failed.any?
        raise SmsError, "Admin SMS failed for #{failed.length}/#{results.length} phones"
      end

      { success: true, results: results }
    end

    private

    # Customer order SMS (order updates, confirmations, refunds)
    # Single source of truth: enable_order_sms (consolidated toggle).
    # No fallback to legacy flags — if enable_order_sms is false, SMS is off.
    # The migration defaults enable_order_sms to false, so SMS must be
    # explicitly enabled by an admin after deploy.
    def sms_enabled?
      return false unless ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?

      SiteSetting.instance.enable_order_sms
    end

    # Admin SMS (new order alerts) — uses the same consolidated toggle as customer SMS.
    # If SMS is off, it's off for everything. Admins who want alerts must keep SMS enabled.
    def admin_sms_enabled?
      return false unless ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?

      SiteSetting.instance.enable_order_sms
    end

    def send_sms(to:, body:, context: nil)
      normalized = normalize_phone(to)
      return skip_result("Invalid phone number: #{to}") unless normalized

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
          Rails.logger.info "[SmsService] SMS sent to #{normalized} (#{context}): status=#{msg_data['status']}"
          { success: true, message_id: msg_data["message_id"], status: msg_data["status"] }
        else
          Rails.logger.error "[SmsService] ClickSend error #{response.code}: #{response.body.to_s.truncate(500)}"
          # Raise so job retry_on can re-attempt delivery on transient failures.
          # Previously returned { success: false } which the job treated as success.
          raise SmsError, "ClickSend API error: #{response.code}"
        end
      rescue StandardError => e
        Rails.logger.error "[SmsService] Error sending SMS: #{e.class} - #{e.message}"
        raise # Let the job retry mechanism handle it
      end
    end

    def normalize_phone(phone)
      digits = phone.to_s.gsub(/\D/, "")

      case digits.length
      when 7
        # Local Guam number (no area code) — prepend +1671
        "+1671#{digits}"
      when 10
        # US/Guam number with area code — prepend +1
        "+1#{digits}"
      when 11
        # Already has country code (1) — prepend +
        return nil unless digits.start_with?("1")
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

    def skip_result(reason)
      Rails.logger.info "[SmsService] Skipped: #{reason}"
      { success: false, skipped: true, reason: reason }
    end
  end
end
