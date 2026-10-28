# frozen_string_literal: true

# One payable catalog price. A location price replaces the global sale only
# when ALL variants share one regular price; it must never flatten size prices.
# Compare prices are only the selected variant's own regular price, never the
# unrelated product base or an overridden global sale.
class CatalogPrice
  QUOTE_TYPES = %w[market_price quote_only].freeze
  Result = Struct.new(:unit_price_cents, :compare_at_price_cents, :purchasable, :reason, :price_varies, :location_id, keyword_init: true) do
    def as_json(*) = to_h
  end

  def self.resolve(product:, variant: nil, location_id: nil, online: false, settings: nil)
    if location_id.present? && product.allow_pickup? && !product.offered_for_location?(location_id)
      return Result.new(unit_price_cents: nil, compare_at_price_cents: nil, purchasable: false,
        reason: "Not offered at this location", price_varies: false, location_id: location_id.to_i)
    end
    variants = product.product_variants.to_a
    regular = variant&.price_cents || variants.select(&:available?).map(&:price_cents).compact.min || product.base_price_cents
    override = product.product_locations.to_a.find { |row| row.location_id == location_id.to_i && row.offered? && row.available? }&.price_override_cents if location_id.present?
    override = nil if variants.map(&:price_cents).uniq.size > 1
    unit = override.nil? ? (product.sale_price_cents || regular) : override
    inquiry_required = online && !StorefrontEligibility.online_ordering_enabled?(product, settings: settings)
    quote = inquiry_required || QUOTE_TYPES.include?(product.product_type) || unit.nil? || (unit.zero? && product.product_type != "complimentary_with_meal" && product.sale_price_cents != 0)
    Result.new(unit_price_cents: quote ? nil : unit,
      compare_at_price_cents: !quote && override.nil? && regular && unit < regular ? regular : nil,
      purchasable: !quote, reason: inquiry_required ? StorefrontEligibility::INQUIRY_REQUIRED_MESSAGE : (quote ? "Contact us for a price before ordering" : nil),
      price_varies: !quote && variant.nil? && override.nil? && product.sale_price_cents.nil? && variants.select(&:available?).map(&:price_cents).uniq.size > 1,
      location_id: location_id.presence&.to_i)
  end

  # SQL companion for range/sort BEFORE pagination. Request values are quoted;
  # the same precedence is covered against resolve in the contract specs.
  def self.sql(location_id: nil, online: false, settings: nil)
    regular = "COALESCE((SELECT MIN(pv.price_cents) FROM product_variants pv WHERE pv.product_id = products.id AND pv.available = TRUE), products.base_price_cents)"
    override = if location_id.present?
      id = ActiveRecord::Base.connection.quote(location_id.to_i)
      "(SELECT pl.price_override_cents FROM product_locations pl WHERE pl.product_id = products.id AND pl.location_id = #{id} AND pl.offered = TRUE AND pl.available = TRUE AND (SELECT COUNT(DISTINCT pv.price_cents) FROM product_variants pv WHERE pv.product_id = products.id) <= 1)"
    else
      "NULL"
    end
    unit = "COALESCE(#{override}, products.sale_price_cents, #{regular})"
    not_offered = if location_id.present?
      id = ActiveRecord::Base.connection.quote(location_id.to_i)
      " OR (products.allow_pickup = TRUE AND EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = products.id) AND NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = products.id AND pl.location_id = #{id} AND pl.offered = TRUE))"
    else
      ""
    end
    inquiry_condition = ""
    if online && !(settings || SiteSetting.instance).enable_catering_online_ordering
      catering = Product.joins(:collections).where("collections.slug LIKE ?", "catering-%").select(:id)
      cookies = Product.joins(:collections).where(collections: { slug: StorefrontEligibility::COOKIE_SLUGS }).select(:id)
      inquiry_condition = " OR (products.id IN (#{catering.to_sql}) AND products.id NOT IN (#{cookies.to_sql}))"
    end
    "CASE WHEN products.product_type IN ('market_price', 'quote_only')#{inquiry_condition}#{not_offered} OR (#{unit} = 0 AND products.product_type != 'complimentary_with_meal' AND COALESCE(products.sale_price_cents, -1) != 0) THEN NULL ELSE #{unit} END"
  end
end
