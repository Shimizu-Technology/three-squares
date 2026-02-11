class FulfillmentValidator
  TYPES = %w[pickup shipping].freeze

  class << self
    def allowed_types_for_product(product)
      types = []
      types << "pickup" if product.allow_pickup?
      types << "shipping" if product.allow_shipping?
      types
    end

    def shared_types_for_products(products)
      normalized = products.compact.uniq
      return [] if normalized.empty?

      normalized
        .map { |product| allowed_types_for_product(product) }
        .reduce(TYPES.dup) { |intersection, types| intersection & types }
    end

    def mixed_cart_incompatible?(products)
      normalized = products.compact.uniq
      return false if normalized.empty?

      mixed_shipping_capabilities?(normalized) || shared_types_for_products(normalized).empty?
    end

    def shared_pickup_location_ids_for_products(products)
      normalized = products.compact.uniq.select(&:allow_pickup?)
      return [] if normalized.empty?

      constrained_location_sets = normalized
        .map { |product| product.product_locations.available.pluck(:location_id).uniq }
        .reject(&:empty?)

      return [] if constrained_location_sets.empty?

      constrained_location_sets.reduce(constrained_location_sets.first) do |intersection, ids|
        intersection & ids
      end
    end

    def pickup_location_incompatible_for_pickup_only?(products)
      normalized = products.compact.uniq
      return false if normalized.empty?
      return false unless shared_types_for_products(normalized) == [ "pickup" ]

      constrained_location_sets = normalized
        .select(&:allow_pickup?)
        .map { |product| product.product_locations.available.pluck(:location_id).uniq }
        .reject(&:empty?)

      return false if constrained_location_sets.empty?

      constrained_location_sets
        .reduce(constrained_location_sets.first) { |intersection, ids| intersection & ids }
        .empty?
    end

    def validate_cart(cart_items:, fulfillment_type:, location_id: nil)
      issues = []

      unless TYPES.include?(fulfillment_type)
        return [
          {
            type: "invalid_fulfillment",
            message: "Fulfillment type must be pickup or shipping"
          }
        ]
      end

      products = cart_items.map { |item| item.product_variant.product }.uniq
      shared_types = shared_types_for_products(products)

      if mixed_shipping_capabilities?(products)
        return [
          {
            type: "mixed_fulfillment",
            message: "Your cart cannot mix shippable and pickup-only items. Please keep to one fulfillment path."
          }
        ]
      end

      if shared_types.empty?
        return [
          {
            type: "mixed_fulfillment",
            message: "Your cart has items that cannot be fulfilled together. Please keep cart items to one fulfillment type."
          }
        ]
      end

      unless shared_types.include?(fulfillment_type)
        return [
          {
            type: "fulfillment_not_supported",
            message: "This cart supports #{shared_types.join(' or ')} only."
          }
        ]
      end

      if fulfillment_type == "pickup" && location_id.blank?
        return [
          {
            type: "location_required",
            message: "Pickup location is required for pickup orders."
          }
        ]
      end

      if fulfillment_type == "pickup" && Location.active.where(id: location_id).blank?
        return [
          {
            type: "invalid_location",
            message: "Selected pickup location is invalid or inactive."
          }
        ]
      end

      cart_items.each do |item|
        product = item.product_variant.product

        unless allowed_types_for_product(product).include?(fulfillment_type)
          issues << {
            type: "product_fulfillment_blocked",
            cart_item_id: item.id,
            message: "#{product.name} is not available for #{fulfillment_type}."
          }
          next
        end

        if fulfillment_type == "pickup" && !product.available_for_location?(location_id)
          issues << {
            type: "location_unavailable",
            cart_item_id: item.id,
            message: "#{product.name} is not available at the selected pickup location."
          }
        end
      end

      issues
    end

    private

    def mixed_shipping_capabilities?(products)
      has_shipping_enabled = products.any?(&:allow_shipping?)
      has_shipping_disabled = products.any? { |product| !product.allow_shipping? }
      has_shipping_enabled && has_shipping_disabled
    end
  end
end

