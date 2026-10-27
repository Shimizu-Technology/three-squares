# frozen_string_literal: true

class AdminPushNotificationService
  class << self
    def send_new_order(order)
      return { success: true, skipped: true, reason: "Web push not configured" } unless WebPushConfig.configured?

      subscriptions = subscriptions_for_order(order)
      return { success: true, skipped: true, reason: "No active subscriptions" } if subscriptions.empty?

      sent = 0

      subscriptions.find_each do |subscription|
        sent += 1 if deliver(subscription, order_payload(order))
      rescue StandardError => e
        handle_delivery_error(subscription, e)
      end

      { success: true, sent: sent }
    end

    def subscriptions_for_order(order)
      scope = AdminPushSubscription.active
        .joins(admin_device: :user)
        .where(users: { role: "admin" })
        .where("users.assigned_location_id IS NULL OR users.assigned_location_id = admin_devices.location_id")
        .merge(AdminDevice.active)

      if order.location_id.present?
        scope.where(admin_devices: { location_id: order.location_id })
      else
        scope.none
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
      # Recheck persisted endpoints too, including records created before validation.
      unless subscription.safe_endpoint?
        subscription.update_columns(active: false, updated_at: Time.current)
        return false
      end

      WebPush.payload_send(
        message: payload,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
        vapid: {
          subject: WebPushConfig.subject,
          public_key: WebPushConfig.public_key,
          private_key: WebPushConfig.private_key
        },
        open_timeout: 5,
        read_timeout: 10,
        ttl: 300
      )

      subscription.update_columns(last_sent_at: Time.current, updated_at: Time.current)
      true
    end

    def handle_delivery_error(subscription, error)
      if error.is_a?(WebPush::ExpiredSubscription) || error.is_a?(WebPush::InvalidSubscription)
        subscription.update_columns(active: false, updated_at: Time.current)
        Rails.logger.warn "Disabling invalid push subscription #{subscription.id} (#{error.class})"
      else
        Rails.logger.error "Push notification failed for subscription #{subscription.id}: #{error.class}"
        raise error
      end
    end
  end
end
