class StorefrontEligibility
  COOKIE_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
  SETTINGS = {
    "three_squares" => :enable_storefront_three_squares,
    "latte_stone" => :enable_storefront_latte_stone,
    "catering" => :enable_storefront_catering
  }.freeze

  def self.key_for(product)
    slugs = product.collections.map(&:slug)
    return "latte_stone" if (slugs & COOKIE_SLUGS).any?
    return "catering" if slugs.any? { |slug| slug.to_s.start_with?("catering-") }
    "three_squares"
  end

  INQUIRY_REQUIRED_MESSAGE = "This item now requires a catering inquiry".freeze

  # Browsing and manual inquiries remain available independently of online sales.
  def self.online_ordering_enabled?(product, settings: nil)
    key_for(product) != "catering" || (settings || SiteSetting.instance).enable_catering_online_ordering == true
  end

  def self.enabled?(product, settings: SiteSetting.instance)
    settings.public_send(SETTINGS.fetch(key_for(product))) == true
  end

  def self.scope(relation, settings: SiteSetting.instance)
    cookies = Product.joins(:collections).where(collections: { slug: COOKIE_SLUGS }).select(:id)
    catering = Product.joins(:collections).where("collections.slug LIKE ?", "catering-%").select(:id)
    allowed = relation.none
    allowed = allowed.or(relation.where(id: cookies)) if settings.enable_storefront_latte_stone
    allowed = allowed.or(relation.where(id: catering).where.not(id: cookies)) if settings.enable_storefront_catering
    if settings.enable_storefront_three_squares
      allowed = allowed.or(relation.where.not(id: cookies).where.not(id: catering))
    end
    allowed
  end
end
