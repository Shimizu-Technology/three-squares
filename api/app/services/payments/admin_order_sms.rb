# frozen_string_literal: true

module Payments
  module AdminOrderSms
    def self.call(order)
      raise DeliverNotification::Retryable, 'Admin SMS not configured' unless SmsService.send(:sms_configured?)
      settings = SiteSetting.instance
      return { success: false, skipped: true, reason: 'Admin SMS disabled' } unless settings.enable_admin_sms
      phones = (Array(settings.admin_sms_phones) + Array(order.location&.admin_sms_phones)).uniq
      return { success: false, skipped: true, reason: 'No admin SMS recipients' } if phones.empty?
      source = order.source == 'pos' ? 'POS' : 'Online'
      message = "NEW ORDER ##{order.order_number} (#{source}) - $#{format('%.2f', order.total_cents / 100.0)} - #{order.customer_name.presence || 'Guest'} - #{order.location&.name || 'Online'}"
      phones.each do |phone|
        DeliverNotification.call(record: order, channel: "admin_sms:#{Digest::SHA256.hexdigest(phone)}",
          job: 'SendAdminOrderSmsJob', args: [order.id]) do
          # The existing transport has no public per-recipient entry point. Use
          # its low-level sender, bypassing customer toggles and preclaim flags.
          SmsService.send(:send_sms, to: phone, body: message, context: "admin_new_order:#{order.id}")
        end
      end
      { success: true }
    end
  end
end
