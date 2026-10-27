# frozen_string_literal: true

module Payments
  class Eligibility
    def self.validate_product!(variant:, location_id: nil, online: true, at: Time.current)
      product = variant.product
      raise FulfillmentError, "#{product.name} is not available" unless product.published? && !product.archived? && variant.available?
      raise FulfillmentError, "This menu is not accepting orders" unless MenuEligibility.enabled?(product, at: at)
      if online
        enabled = StorefrontEligibility.enabled?(product, settings: SiteSetting.instance)
        raise FulfillmentError, "This storefront is not accepting orders" unless enabled
      end
      if location_id.present? && product.allow_pickup?
        location = Location.active.find_by(id: location_id)
        raise FulfillmentError, "Selected pickup location is unavailable" unless location
        raise FulfillmentError, "This location is not accepting orders" if !location.accepting_orders_at?(at)
        raise FulfillmentError, "#{product.name} is not available at this location" unless product.allow_pickup? && product.available_for_location?(location_id)
      elsif !product.allow_shipping? && !Location.active.any? { |location| product.available_for_location?(location.id) }
        raise FulfillmentError, "#{product.name} has no available pickup location"
      end
      true
    end

    def self.validate!(items:, fulfillment_type:, location_id:, online: true, at: Time.current)
      raise FulfillmentError, "Cart is empty" if items.empty?
      issues = FulfillmentValidator.validate_cart(cart_items: items, fulfillment_type: fulfillment_type, location_id: location_id)
      raise FulfillmentError, issues.first[:message] if issues.any?
      items.each { |item| validate_product!(variant: item.product_variant, location_id: fulfillment_type == "pickup" ? location_id : nil, online: online, at: at) }
      true
    end

    def self.validate_order!(order)
      validate!(items: order.order_items.includes(product_variant: { product: :collections }).to_a,
        fulfillment_type: order.fulfillment_type, location_id: order.location_id, online: order.source == "online", at: order.created_at)
    end
  end
end
