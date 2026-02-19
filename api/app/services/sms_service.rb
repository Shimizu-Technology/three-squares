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
                  "Total: $#{format_price(order.total_cents)}. " \
                  "We'll text you when it's ready for pickup at #{location_name}."
      else
        message = "Three Squares: Order ##{order.order_number} received! " \
                  "Total: $#{format_price(order.total_cents)}. " \
                  "We'll send shipping updates to this number."
      end

      send_sms(to: order.customer_phone, body: message, context: "order_placed:#{order.id}")
    end

    # Send SMS to admin phones when a new order comes in
    def send_admin_new_order(order)
      return skip_result("SMS not configured") unless ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?
      return skip_result("SMS notifications disabled") unless SiteSetting.instance.send_sms_notifications

      settings = SiteSetting.instance
      admin_phones = settings.admin_sms_phones || []
      return skip_result("No admin SMS phones configured") if admin_phones.empty?

      location_name = order.location&.name || "Online"
      source_label = order.source == "pos" ? "POS" : "Online"
      message = "NEW ORDER ##{order.order_number} (#{source_label}) - " \
                "$#{format_price(order.total_cents)} - #{order.customer_name || 'Guest'} " \
                "- #{location_name}"

      results = admin_phones.map do |phone|
        send_sms(to: phone, body: message, context: "admin_new_order:#{order.id}")
      end

      { success: results.all? { |r| r[:success] }, results: results }
    end

    private

    def sms_enabled?
      return false unless ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?

      settings = SiteSetting.instance
      settings.send_sms_notifications && settings.sms_order_updates
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
          { success: false, error: "ClickSend API error: #{response.code}" }
        end
      rescue StandardError => e
        Rails.logger.error "[SmsService] Error sending SMS: #{e.class} - #{e.message}"
        { success: false, error: e.message }
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

    def skip_result(reason)
      Rails.logger.info "[SmsService] Skipped: #{reason}"
      { success: false, skipped: true, reason: reason }
    end
  end
end
