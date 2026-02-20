class Collection < ApplicationRecord
  include Sanitizable
  sanitize_fields :name, :description

  # Associations
  has_many :product_collections, dependent: :destroy
  has_many :products, through: :product_collections

  # Collection types for seasonal/special menus
  COLLECTION_TYPES = %w[standard seasonal event limited_time].freeze

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }
  validates :collection_type, inclusion: { in: COLLECTION_TYPES }

  # Business line
  BUSINESS_LINES = %w[three_squares latte_stone_cookies bgpacific].freeze
  validates :business_line, inclusion: { in: BUSINESS_LINES }

  validate :ends_at_after_starts_at

  # Business line scopes
  scope :three_squares, -> { where(business_line: "three_squares") }
  scope :latte_stone_cookies, -> { where(business_line: "latte_stone_cookies") }
  scope :bgpacific, -> { where(business_line: "bgpacific") }
  scope :by_business_line, ->(line) { line.present? ? where(business_line: line) : all }

  # Existing scopes
  scope :published, -> { where(published: true) }
  scope :featured, -> { where(featured: true) }
  scope :by_position, -> { order(sort_order: :asc, name: :asc) }

  # Seasonal/special menu scopes
  scope :seasonal, -> { where(collection_type: "seasonal") }
  scope :event, -> { where(collection_type: "event") }
  scope :limited_time, -> { where(collection_type: "limited_time") }
  scope :standard, -> { where(collection_type: "standard") }
  scope :is_featured, -> { where(is_featured: true) }
  scope :by_collection_type, ->(type) { type.present? ? where(collection_type: type) : all }

  # Currently active: within date range (or no date range set)
  scope :currently_active, -> {
    now = Time.current
    where("starts_at IS NULL OR starts_at <= ?", now)
      .where("ends_at IS NULL OR ends_at >= ?", now)
  }

  # Customer visible: published + within date range
  scope :customer_visible, -> {
    published.currently_active
  }

  # Callbacks
  before_validation :generate_slug, if: -> { slug.blank? }

  # Class methods

  # Auto-hide expired collections (like Location.auto_deactivate_expired!)
  def self.auto_hide_expired!
    where(auto_hide: true, published: true)
      .where("ends_at < ?", Time.current)
      .update_all(published: false)
  end

  # Instance methods
  def to_param
    slug
  end

  def seasonal?
    collection_type == "seasonal"
  end

  def event?
    collection_type == "event"
  end

  def limited_time?
    collection_type == "limited_time"
  end

  def standard?
    collection_type == "standard"
  end

  def active_now?
    return false unless published?
    return true if starts_at.nil? && ends_at.nil?
    now = Time.current
    (starts_at.nil? || starts_at <= now) && (ends_at.nil? || ends_at >= now)
  end

  def expired?
    ends_at.present? && ends_at < Time.current
  end

  def upcoming?
    starts_at.present? && starts_at > Time.current
  end

  private

  def generate_slug
    sanitized_name = ActionController::Base.helpers.strip_tags(name.to_s)
    self.slug = sanitized_name.parameterize
  end

  def ends_at_after_starts_at
    return if starts_at.blank? || ends_at.blank?
    if ends_at <= starts_at
      errors.add(:ends_at, "must be after starts_at")
    end
  end
end
