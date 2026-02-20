class Collection < ApplicationRecord
  include Sanitizable
  sanitize_fields :name, :description

  # Associations
  has_many :product_collections, dependent: :destroy
  has_many :products, through: :product_collections

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }

  # Business line
  BUSINESS_LINES = %w[three_squares latte_stone_cookies bgpacific].freeze
  validates :business_line, inclusion: { in: BUSINESS_LINES }

  scope :three_squares, -> { where(business_line: "three_squares") }
  scope :latte_stone_cookies, -> { where(business_line: "latte_stone_cookies") }
  scope :bgpacific, -> { where(business_line: "bgpacific") }
  scope :by_business_line, ->(line) { line.present? ? where(business_line: line) : all }

  # Scopes
  scope :published, -> { where(published: true) }
  scope :featured, -> { where(featured: true) }
  scope :by_position, -> { order(sort_order: :asc, name: :asc) }

  # Callbacks
  before_validation :generate_slug, if: -> { slug.blank? }

  # Instance methods
  def to_param
    slug
  end

  private

  def generate_slug
    sanitized_name = ActionController::Base.helpers.strip_tags(name.to_s)
    self.slug = sanitized_name.parameterize
  end
end
