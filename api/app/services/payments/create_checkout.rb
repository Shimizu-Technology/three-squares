# frozen_string_literal: true

module Payments
  class CreateCheckout
    ORDER_FIELDS = %w[user_id location_id order_type source staff_created created_by_user_id fulfillment_type customer_name customer_email customer_phone notes shipping_address_line1 shipping_address_line2 shipping_city shipping_state shipping_zip shipping_country shipping_method subtotal_cents shipping_cost_cents tax_cents total_cents payment_method].freeze
    ITEM_FIELDS = %w[id product_id product_variant_id quantity unit_price_cents total_price_cents special_instructions product_name variant_name product_sku].freeze

    def self.call(user:, capability:, idempotency_key:, cart_items:, attributes:, channel: "online", existing_order: nil)
      attrs = attributes.to_h.deep_stringify_keys
      raise Error, "Idempotency-Key is required" unless idempotency_key.to_s.match?(/\A[a-zA-Z0-9_-]{16,100}\z/)
      if user.nil? && !capability.to_s.match?(/\A[a-f0-9]{64}\z/)
        raise Error, "A secure checkout capability is required"
      end
      owner_key = user ? "user:#{user.id}" : "guest:#{CheckoutSession.digest(capability)}"
      request_digest = Snapshot.digest(attrs)
      existing = CheckoutSession.find_by(owner_key: owner_key, caller_idempotency_key: idempotency_key)
      if existing
        raise Conflict, "Idempotency key was already used for different checkout details" unless existing.snapshot["request_digest"] == request_digest
        return existing
      end
      fulfillment = attrs["fulfillment_type"]
      location_id = attrs["location_id"].presence
      Eligibility.validate!(items: cart_items, fulfillment_type: fulfillment, location_id: location_id, online: channel == "online")
      pricing = CheckoutPricingService.resolve!(cart_items: cart_items, fulfillment_type: fulfillment,
        shipping_address: attrs["shipping_address"], shipping_method: attrs["shipping_method"])
      raise Error, "Order total must be greater than zero" unless pricing.total_cents.positive?
      profile = ProviderResolver.profile!(location_id: location_id, channel: channel)
      identity = profile.payment_identity
      Configuration.validate_identity!(identity)
      session = nil
      ActiveRecord::Base.transaction do
        # Serialize idempotent creates before pending-order and inventory writes.
        lock_number = Digest::SHA256.hexdigest("#{owner_key}:#{idempotency_key}")[0,15].to_i(16)
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{lock_number})")
        existing = CheckoutSession.find_by(owner_key: owner_key, caller_idempotency_key: idempotency_key)
        if existing
          raise Conflict, "Idempotency key was already used for different checkout details" unless existing.snapshot["request_digest"] == request_digest
          return existing
        end
        cart_items.each do |item|
          next unless item.is_a?(CartItem)
          fresh = CartItem.lock.find(item.id)
          raise Conflict, "Cart changed. Please review it before paying" unless fresh.updated_at == item.updated_at && fresh.quantity == item.quantity
        end
        order = existing_order || build_order(user: user, attrs: attrs, pricing: pricing, cart_items: cart_items)
        order.payment_identity_id = identity.id
        order.payment_provider = identity.provider
        order.payment_environment = identity.environment
        order.simulated = identity.environment == "simulated"
        order.guest_access_digest = CheckoutSession.digest(capability) unless user
        order.guest_access_expires_at = 30.days.from_now unless user
        order.save!
        snapshot = { "order" => order.attributes.slice(*ORDER_FIELDS), "items" => order.order_items.order(:id).map { |item| item.attributes.slice(*ITEM_FIELDS) },
          "cart_items" => cart_items.select { |item| item.is_a?(CartItem) }.map { |item| { "id" => item.id, "quantity" => item.quantity, "updated_at" => item.updated_at.iso8601(6) } }, "request_digest" => request_digest }
        session = CheckoutSession.create!(order: order, user: user, location_id: location_id, channel: channel, payment_identity: identity,
          owner_key: owner_key, guest_capability_digest: user ? "" : CheckoutSession.digest(capability), caller_idempotency_key: idempotency_key,
          snapshot: snapshot, snapshot_digest: Snapshot.digest(snapshot), amount_cents: pricing.total_cents, currency: identity.currency, expires_at: 30.minutes.from_now)
        attempt = PaymentAttempt.create!(checkout_session: session, order: order, payment_identity: identity,
          requested_cents: session.amount_cents, currency: session.currency, payload_digest: session.snapshot_digest, next_recovery_at: 1.minute.from_now)
        order.update!(checkout_session_id: session.id, payment_attempt_id: attempt.id)
        Snapshot.persist!(session: session, attempt: attempt, order: order)
        ReserveInventory.call(order: order, expires_at: session.expires_at)
      end
      session
    end

    def self.build_order(user:, attrs:, pricing:, cart_items:)
      address = attrs["shipping_address"] || {}
      order = Order.new(user: user, source: "online", order_type: "retail", fulfillment_type: attrs["fulfillment_type"],
        location_id: attrs["fulfillment_type"] == "pickup" ? attrs["location_id"] : nil, status: "pending", payment_status: "pending", payment_method: "card_online",
        customer_name: attrs["customer_name"].presence || address["name"], customer_email: attrs["customer_email"].presence || attrs["email"],
        customer_phone: attrs["customer_phone"].presence || attrs["phone"], notes: attrs["notes"],
        shipping_address_line1: address["street1"], shipping_address_line2: address["street2"], shipping_city: address["city"], shipping_state: address["state"],
        shipping_zip: address["zip"], shipping_country: address["country"].presence || "US", shipping_method: pricing.shipping_method_label,
        subtotal_cents: pricing.subtotal_cents, shipping_cost_cents: pricing.shipping_cost_cents, tax_cents: 0, total_cents: pricing.total_cents)
      cart_items.each do |item|
        variant = item.product_variant
        order.order_items.build(product_variant: variant, product_id: variant.product_id, quantity: item.quantity,
          unit_price_cents: variant.effective_unit_price_cents, total_price_cents: variant.effective_unit_price_cents * item.quantity,
          special_instructions: attrs.fetch("item_special_instructions", {})[item.id.to_s])
      end
      order
    end
  end
end
