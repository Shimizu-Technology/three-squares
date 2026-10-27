# frozen_string_literal: true

class CheckoutPricingService
  class PricingError < StandardError; end

  REQUIRED_SHIPPING_ADDRESS_FIELDS = %i[street1 city state zip country].freeze

  Result = Struct.new(
    :subtotal_cents,
    :shipping_cost_cents,
    :total_cents,
    :shipping_method_label,
    :shipping_rate,
    keyword_init: true
  )

  class << self
    def resolve!(cart_items:, fulfillment_type:, shipping_address: nil, shipping_method: nil)
      subtotal_cents = cart_items.sum { |item| item.product_variant.effective_unit_price_cents * item.quantity }

      if fulfillment_type == "pickup"
        return Result.new(
          subtotal_cents: subtotal_cents,
          shipping_cost_cents: 0,
          total_cents: subtotal_cents,
          shipping_method_label: "PICKUP In-Store Pickup",
          shipping_rate: nil
        )
      end

      destination = normalize_shipping_address(shipping_address)
      selected_rate = resolve_shipping_rate!(cart_items, destination, shipping_method)
      shipping_cost_cents = selected_rate[:rate_cents].to_i

      Result.new(
        subtotal_cents: subtotal_cents,
        shipping_cost_cents: shipping_cost_cents,
        total_cents: subtotal_cents + shipping_cost_cents,
        shipping_method_label: [ selected_rate[:carrier], selected_rate[:service] ].compact.join(" ").presence,
        shipping_rate: selected_rate
      )
    end

    private

    def normalize_shipping_address(shipping_address)
      address = (shipping_address || {}).to_h.deep_symbolize_keys
      missing_fields = REQUIRED_SHIPPING_ADDRESS_FIELDS.select { |field| address[field].blank? }

      if missing_fields.any?
        raise PricingError, "Shipping address is missing required fields: #{missing_fields.join(', ')}"
      end

      address
    end

    def resolve_shipping_rate!(cart_items, destination, shipping_method)
      normalized_method = (shipping_method || {}).to_h.deep_symbolize_keys
      carrier = normalized_method[:carrier].to_s.strip
      service = normalized_method[:service].to_s.strip
      rate_cents = normalized_method[:rate_cents].to_i
      requested_rate_id = normalized_method[:rate_id].to_s.strip.presence

      if carrier.blank? || service.blank?
        raise PricingError, "Shipping method is incomplete. Please recalculate shipping and select a delivery option."
      end

      available_rates = ShippingService.calculate_rates(cart_items, destination)
      selected_rate =
        if requested_rate_id.present?
          rate = available_rates.find { |available_rate| available_rate[:rate_id].to_s == requested_rate_id }
          validate_selected_rate!(rate, carrier: carrier, service: service, rate_cents: rate_cents)
          rate
        else
          available_rates.find do |rate|
            rate[:carrier].to_s == carrier &&
              rate[:service].to_s == service &&
              rate[:rate_cents].to_i == rate_cents
          end
        end

      unless selected_rate
        raise PricingError, "Selected shipping method is no longer available. Please recalculate shipping."
      end

      selected_rate.deep_symbolize_keys
    end

    def validate_selected_rate!(rate, carrier:, service:, rate_cents:)
      return if rate.blank?
      return if rate[:carrier].to_s == carrier &&
                rate[:service].to_s == service &&
                rate[:rate_cents].to_i == rate_cents

      raise PricingError, "Selected shipping method is no longer available. Please recalculate shipping."
    end
  end
end
