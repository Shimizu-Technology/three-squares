class Collection < ApplicationRecord
  COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze

  include Sanitizable
  sanitize_fields :name, :description

  # Associations
  has_many :product_collections, dependent: :destroy
  has_many :products, through: :product_collections

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }

  # Scopes
  scope :published, -> { where(published: true) }
  scope :featured, -> { where(featured: true) }
  scope :by_position, -> { order(sort_order: :asc, name: :asc) }
  scope :for_storefront, lambda { |storefront|
    case storefront.to_s
    when "latte_stone"
      where(slug: COOKIE_COLLECTION_SLUGS)
    when "catering"
      where("collections.slug LIKE ?", "catering-%")
    when "three_squares"
      where.not(slug: COOKIE_COLLECTION_SLUGS).where.not("collections.slug LIKE ?", "catering-%")
    else
      all
    end
  }

  # Callbacks
  before_validation :generate_slug, if: -> { slug.blank? }

  # Instance methods
  def to_param
    slug
  end

  def storefront_key
    return "latte_stone" if slug.in?(COOKIE_COLLECTION_SLUGS)
    return "catering" if slug.start_with?("catering-")

    "three_squares"
  end

  def self.for_enabled_storefronts(settings = SiteSetting.instance)
    relations = []
    relations << for_storefront("three_squares") if settings.enable_storefront_three_squares
    relations << for_storefront("latte_stone") if settings.enable_storefront_latte_stone
    relations << for_storefront("catering") if settings.enable_storefront_catering

    return none if relations.empty?

    relations.reduce(none) { |scope, relation| scope.or(relation) }
  end

  private

  def generate_slug
    sanitized_name = ActionController::Base.helpers.strip_tags(name.to_s)
    self.slug = sanitized_name.parameterize
  end
end
