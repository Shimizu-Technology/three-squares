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
      shared_types_for_products(products).empty?
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
  end
end

