class ProductVariant < ApplicationRecord
  belongs_to :product

  # Validations
  validates :variant_key, presence: true
  validates :sku, presence: true, uniqueness: true
  validates :price_cents, numericality: { greater_than_or_equal_to: 0 }
  validates :stock_quantity, numericality: { greater_than_or_equal_to: 0 }, if: -> { product&.inventory_level == "variant" }
  # Weight is required for new records (allows nil for legacy data, but validates > 0 if present)
  validates :weight_oz, numericality: { greater_than: 0, message: "must be greater than 0" }, if: -> { weight_oz.present? }
  validates :weight_oz, presence: { message: "is required for shipping" }, on: :create, unless: -> { skip_weight_validation? }

  # Allow skipping weight validation during imports (set via attr_accessor)
  attr_accessor :skip_weight_validation
  def skip_weight_validation?
    @skip_weight_validation == true
  end

  # Scopes
  scope :available, -> { where(available: true) }
  scope :in_stock, -> { where("stock_quantity > 0") }
  scope :real_variants, -> { where(is_default: false) }
  scope :default_variants, -> { where(is_default: true) }

  # Callbacks
  before_validation :generate_variant_key, if: -> { variant_key.blank? }
  before_validation :generate_variant_name, if: -> { variant_name.blank? }
  before_validation :generate_sku, if: -> { sku.blank? }

  # Money handling
  def price
    Money.new(price_cents || 0, "USD")
  end

  def price=(amount)
    self.price_cents = (amount.to_f * 100).to_i
  end

  # ==========================================
  # Options / Display Methods
  # ==========================================

  # Primary display method - uses options first, falls back to legacy columns
  def display_name
    raw = variant_name.presence || options_display_name || legacy_display_name
    normalize_display_name(raw)
  end

  # Generate display name from flexible options JSONB field
  def options_display_name
    return nil if options.blank?
    options.values.compact.join(" / ")
  end

  # Fallback to legacy size/color columns (for backward compatibility)
  def legacy_display_name
    normalized_size = self.class.normalize_size_token(size)
    [ normalized_size, color ].compact.join(" / ").presence
  end

  # Get options with indifferent access
  def options_hash
    return {} if options.blank?
    options.with_indifferent_access
  end

  # Get a specific option value
  def option_value(option_type)
    options_hash[option_type]
  end

  # Get all option types for this variant
  def option_types
    options_hash.keys
  end

  def in_stock?
    return true unless product.inventory_level == "variant"
    stock_quantity > 0
  end

  # Computed availability: respects both manual `available` flag AND stock levels
  def actually_available?
    return available unless product.inventory_level == "variant"
    # For variant-level tracking, must be both manually available AND in stock
    available && stock_quantity > 0
  end

  def stock_status
    return "not_tracked" unless product.inventory_level == "variant"
    return "out_of_stock" if stock_quantity <= 0
    return "low_stock" if stock_quantity <= low_stock_threshold
    "in_stock"
  end

  def low_stock?
    return false unless product.inventory_level == "variant"
    stock_quantity > 0 && stock_quantity <= low_stock_threshold
  end

  def decrement_stock!(quantity = 1)
    return unless product.inventory_level == "variant"
    update!(stock_quantity: stock_quantity - quantity)
  end

  def increment_stock!(quantity = 1)
    return unless product.inventory_level == "variant"
    update!(stock_quantity: stock_quantity + quantity)
  end

  private

  # Generate variant key from options (or legacy columns as fallback)
  def generate_variant_key
    if options.present?
      # Use options JSONB field
      parts = options.values.compact.map { |v| v.to_s.encode("UTF-8").parameterize }
      self.variant_key = parts.any? ? parts.join("-") : "default"
    else
      # Fallback to legacy columns
      parts = [ size, color ].compact.map { |v| v.to_s.encode("UTF-8").parameterize }
      self.variant_key = parts.any? ? parts.join("-") : "default"
    end
  end

  # Generate display name from options (or legacy columns as fallback)
  def generate_variant_name
    if options.present?
      self.variant_name = options.values.compact.join(" / ")
    else
      normalized_size = self.class.normalize_size_token(size)
      parts = [ normalized_size, color ].compact
      self.variant_name = parts.join(" / ") if parts.any?
    end
  end

  def normalize_display_name(value)
    return nil if value.blank?

    value
      .split("/")
      .map { |part| self.class.normalize_size_token(part) }
      .map { |part| part.to_s.strip }
      .reject(&:blank?)
      .join(" / ")
      .presence
  end

  def self.normalize_size_token(value)
    token = value.to_s.strip
    return nil if token.blank?

    return "One Size" if size_like_default?(token)

    if size_patterns.any? { |pattern| token.match?(pattern) }
      token.upcase
    else
      token
    end
  end

  def self.size_like?(value)
    token = value.to_s.strip
    return false if token.blank?
    return true if size_like_default?(token)

    size_patterns.any? { |pattern| token.match?(pattern) }
  end

  def self.extract_size_from_text(text)
    return nil if text.blank?

    tokens = text.to_s.split(/[\s\/\-_,]+/)
    tokens.reverse_each do |token|
      next if token.blank?
      return normalize_size_token(token) if size_like?(token)
    end

    nil
  end

  def self.size_like_default?(token)
    token.casecmp("default title").zero? ||
      token.casecmp("default").zero? ||
      token.casecmp("one size").zero?
  end

  def self.size_patterns
    [
      /\A(?:xs|s|m|l|xl|xxl|xxxl)\z/i,
      /\A\d+xl\z/i,
      /\Ay(?:xs|s|m|l|xl)\z/i,
      /\A\d+t\z/i
    ]
  end

  # Generate SKU from variant key
  # Include product_id for default variants to prevent cross-product collisions
  # (e.g., two products both generating "TSQ-TSHIRT-DEFAULT")
  def generate_sku
    base = product.sku_prefix || product.slug
    if variant_key == "default" && product.id.present?
      self.sku = "#{base}-#{product.id}-#{variant_key}".upcase
    else
      self.sku = "#{base}-#{variant_key}".upcase
    end
  end
end
