# frozen_string_literal: true

class AdminPushNotificationService
  class << self
    def send_new_order(order)
      return { success: true, skipped: true, reason: "Web push not configured" } unless WebPushConfig.configured?

      subscriptions = subscriptions_for_order(order)
      return { success: true, skipped: true, reason: "No active subscriptions" } if subscriptions.empty?

      sent = 0

      subscriptions.find_each do |subscription|
        deliver(subscription, order_payload(order))
        sent += 1
      rescue StandardError => e
        handle_delivery_error(subscription, e)
      end

      { success: true, sent: sent }
    end

    def subscriptions_for_order(order)
      scope = AdminPushSubscription.active
        .joins(:admin_device)
        .merge(AdminDevice.active)

      if order.location_id.present?
        scope.where(admin_devices: { location_id: [ order.location_id, nil ] })
      else
        scope.where(admin_devices: { location_id: nil })
      end
    end

    private

    def order_payload(order)
      location_name = order.location&.name || "All locations"
      order_total = format("$%.2f", (order.total_cents || 0) / 100.0)

      {
        title: "New order ##{order.order_number}",
        body: "#{location_name} • #{order.customer_name.presence || 'Guest'} • #{order_total}",
        tag: "order-#{order.id}",
        url: "/admin/orders?id=#{order.id}",
        order_id: order.id,
        order_number: order.order_number,
        location_name: location_name
      }.to_json
    end

    def deliver(subscription, payload)
      Webpush.payload_send(
        message: payload,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
        vapid: {
          subject: WebPushConfig.subject,
          public_key: WebPushConfig.public_key,
          private_key: WebPushConfig.private_key
        },
        ttl: 300
      )

      subscription.update_columns(last_sent_at: Time.current, active: true, updated_at: Time.current)
    end

    def handle_delivery_error(subscription, error)
      message = error.message.to_s

      if invalid_subscription_error?(message)
        subscription.update_columns(active: false, updated_at: Time.current)
        Rails.logger.warn "Disabling invalid push subscription #{subscription.id}: #{message}"
      else
        Rails.logger.error "Push notification failed for subscription #{subscription.id}: #{error.class} - #{message}"
        raise error
      end
    end

    def invalid_subscription_error?(message)
      lowered = message.downcase
      lowered.include?("404") ||
        lowered.include?("410") ||
        lowered.include?("expired") ||
        lowered.include?("invalid subscription") ||
        lowered.include?("unsubscribe") ||
        lowered.include?("not registered")
    end
  end
end
