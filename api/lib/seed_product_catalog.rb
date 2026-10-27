# frozen_string_literal: true

# Shared by seeds and its focused regressions; never fabricates shipping weight.
module SeedProductCatalog
  COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
  DONKI_COLLECTION_SLUG = "donki".freeze

  def self.create_product(attrs)
    collection = Collection.find_by(slug: attrs[:collection_slug])
    all_locations = Location.by_name.to_a

    # Determine product_type: explicit > requires_shipping > default local
    product_type = if attrs[:product_type]
      attrs[:product_type]
    elsif attrs[:requires_shipping]
      "shippable"
    else
      "local"
    end

    product = Product.find_or_create_by!(slug: attrs[:slug]) do |p|
      p.name = attrs[:name]
      p.description = attrs[:description] || ""
      p.base_price_cents = attrs[:price] ? (BigDecimal(attrs[:price].to_s) * 100).round.to_i : 0
      p.featured = attrs[:featured] || false
      p.published = true
      p.product_type = product_type
    end

    # Shipping defaults:
    # - explicit allow_shipping wins
    # - then requires_shipping flag
    # - then cookie collections default to shippable
    allow_shipping = if attrs.key?(:allow_shipping)
      attrs[:allow_shipping]
    elsif attrs[:requires_shipping] == true
      true
    else
      COOKIE_COLLECTION_SLUGS.include?(attrs[:collection_slug])
    end
    allow_pickup = attrs.key?(:allow_pickup) ? attrs[:allow_pickup] : true
    weight = attrs.key?(:weight_oz) ? attrs[:weight_oz] : product.weight_oz
    has_weight = weight.present? && weight.to_d.positive?
    # Preserve compatible legacy shipping items with measured option weights.
    # New seeds without a known weight stay pickup-only until staff weigh them.
    legacy_weighted_options = product.allow_shipping? && product.product_variants.any? &&
      product.product_variants.all? { |variant| variant.weight_oz&.positive? }
    allow_shipping &&= has_weight || legacy_weighted_options

    default_location_slugs = if attrs[:collection_slug] == DONKI_COLLECTION_SLUG
      [ "three-squares-donki" ]
    else
      [ "three-squares-main" ]
    end
    location_slugs = attrs[:location_slugs] || default_location_slugs
    location_slugs = [] unless allow_pickup

    product.update!(
      name: attrs[:name],
      description: attrs[:description] || "",
      base_price_cents: attrs[:price] ? (BigDecimal(attrs[:price].to_s) * 100).round.to_i : 0,
      featured: attrs[:featured] || false,
      published: true,
      product_type: product_type,
      allow_pickup: allow_pickup,
      allow_shipping: allow_shipping,
      weight_oz: weight
    )

    if collection && !product.collections.include?(collection)
      product.collections << collection
    end

    if all_locations.any?
      selected_location_ids = Location.where(slug: location_slugs).pluck(:id)
      all_locations.each do |location|
        record = ProductLocation.find_or_initialize_by(product_id: product.id, location_id: location.id)
        record.available = selected_location_ids.include?(location.id)
        record.save!
      end
    end

    product
  end
end
