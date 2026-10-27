class Collection < ApplicationRecord
  COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
  COLLECTION_TYPES = %w[standard seasonal event limited_time].freeze

  include Sanitizable
  sanitize_fields :name, :description, :banner_text

  # Associations
  has_many :product_collections, dependent: :destroy
  has_many :products, through: :product_collections

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }
  validates :collection_type, inclusion: { in: COLLECTION_TYPES }
  validates :auto_hide, inclusion: { in: [ true, false ] }
  validates :banner_text, length: { maximum: 200 }
  validate :valid_ordering_window

  # Scopes
  scope :published, -> { where(published: true) }
  scope :featured, -> { where(featured: true) }
  scope :by_position, -> { order(sort_order: :asc, name: :asc) }
  scope :scheduled_or_special, -> {
    where.not(collection_type: "standard").or(where.not(starts_at: nil)).or(where.not(ends_at: nil))
  }
  scope :ordering_at, ->(at = Time.current) {
    published.where("collections.starts_at IS NULL OR collections.starts_at <= ?", at)
      .where("collections.ends_at IS NULL OR collections.ends_at > ?", at)
  }
  scope :visible_at, ->(at = Time.current) {
    published.where("collections.starts_at IS NULL OR collections.starts_at <= ?", at)
      .where("collections.ends_at IS NULL OR collections.ends_at > ? OR collections.auto_hide = ?", at, false)
  }
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
  before_validation :sync_featured_alias

  # Instance methods
  def to_param
    slug
  end

  def scheduled_or_special?
    collection_type != "standard" || starts_at.present? || ends_at.present?
  end

  def ordering_available?(at: Time.current)
    published? && (starts_at.nil? || starts_at <= at) && (ends_at.nil? || at < ends_at)
  end

  def visible?(at: Time.current)
    published? && (starts_at.nil? || starts_at <= at) && (ends_at.nil? || at < ends_at || !auto_hide?)
  end

  def availability_status(at: Time.current)
    return "unpublished" unless published?
    return "upcoming" if starts_at && at < starts_at
    return "ended" if ends_at && at >= ends_at

    "active"
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

  def valid_ordering_window
    %i[starts_at ends_at].each do |field|
      raw = public_send("#{field}_before_type_cast")
      next if raw.blank?

      begin
        # Rails otherwise silently rolls dates such as February 30 into March.
        DateTime.iso8601(raw) if raw.is_a?(String)
        raise ArgumentError if public_send(field).nil?
      rescue ArgumentError
        errors.add(field, "must be a valid datetime")
      end
    end
    if starts_at && ends_at && ends_at <= starts_at
      errors.add(:ends_at, "must be after starts at")
    end
  end

  # `featured` remains canonical, including when both names are submitted.
  def sync_featured_alias
    self.featured = is_featured if is_featured_changed? && !featured_changed?
    self.featured = false if featured.nil?
    self.is_featured = featured
  end

  def generate_slug
    sanitized_name = ActionController::Base.helpers.strip_tags(name.to_s)
    self.slug = sanitized_name.parameterize
  end
end
