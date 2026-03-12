class Product < ApplicationRecord
  include Sanitizable
  sanitize_fields :name, :description, :meta_title, :meta_description

  # Associations
  has_many :product_variants, dependent: :destroy
  has_many :product_images, -> { order(position: :asc) }, dependent: :destroy
  has_many :product_collections, dependent: :destroy
  has_many :product_locations, dependent: :destroy
  has_many :collections, through: :product_collections
  has_many :locations, through: :product_locations
  has_many :order_items, dependent: :restrict_with_error

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }
  validates :base_price_cents, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :inventory_level, inclusion: { in: %w[none product variant] }
  validates :product_stock_quantity, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true, if: -> { inventory_level == "product" }
  validates :product_low_stock_threshold, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :allow_pickup, inclusion: { in: [ true, false ] }
  validates :allow_shipping, inclusion: { in: [ true, false ] }
  validate :check_variants_not_in_carts_before_level_change, on: :update
  validate :must_support_at_least_one_fulfillment_type

  # Scopes
  scope :published, -> { where(published: true) }
  scope :featured, -> { where(featured: true) }
  scope :active, -> { where(archived: false) }
  scope :archived, -> { where(archived: true) }
  scope :by_type, ->(type) { where(product_type: type) }
  scope :needs_attention, -> { where(needs_attention: true) }
  scope :in_stock, -> {
    where(inventory_level: "none")
      .or(where(inventory_level: "product").where("product_stock_quantity > 0"))
      .or(where(inventory_level: "variant").joins(:product_variants).where("product_variants.stock_quantity > 0"))
  }

  # Callbacks
  before_validation :generate_slug, if: -> { slug.blank? }
  before_validation :generate_sku_prefix, if: -> { sku_prefix.blank? }
  after_save :ensure_default_variant, if: -> { saved_change_to_inventory_level? || ([ "product", "none" ].include?(inventory_level) && product_variants.none?) }
  after_create :regenerate_variant_skus_with_id
  after_update :handle_inventory_level_change, if: -> { saved_change_to_inventory_level? }

  # Money handling
  def base_price
    Money.new(base_price_cents || 0, "USD")
  end

  def base_price=(amount)
    self.base_price_cents = (amount.to_f * 100).to_i
  end

  # Instance methods
  def to_param
    slug
  end

  def primary_image
    product_images.find_by(primary: true) || product_images.first
  end

  def in_stock?
    case inventory_level
    when "none"
      true
    when "product"
      (product_stock_quantity || 0) > 0
    when "variant"
      product_variants.where("stock_quantity > 0").exists?
    else
      true
    end
  end

  # Computed availability: respects both `published` status AND stock levels
  def actually_available?
    return false unless published?
    return false if archived? # Archived products are never available

    case inventory_level
    when "none"
      true  # Always available if published and not tracking inventory
    when "product"
      (product_stock_quantity || 0) > 0  # Must have product-level stock
    when "variant"
      # Must have at least one variant that's actually available
      product_variants.any? { |v| v.actually_available? }
    else
      true
    end
  end

  # Archive/Unarchive methods
  def archive!
    update!(archived: true, published: false)
  end

  def unarchive!
    update!(archived: false)
  end

  def archived?
    archived == true
  end

  def product_stock_status
    return "not_tracked" unless inventory_level == "product"
    return "out_of_stock" if (product_stock_quantity || 0) <= 0
    return "low_stock" if (product_stock_quantity || 0) <= (product_low_stock_threshold || 5)
    "in_stock"
  end

  def product_low_stock?
    return false unless inventory_level == "product"
    qty = product_stock_quantity || 0
    threshold = product_low_stock_threshold || 5
    qty > 0 && qty <= threshold
  end

  def available_variants
    published? ? product_variants.where(available: true) : product_variants
  end

  def available_for_location?(location_id)
    return false unless allow_pickup?
    return false if location_id.blank?
    return true if product_locations.empty?

    product_locations.available.where(location_id: location_id).exists?
  end

  private

  def generate_slug
    self.slug = name.to_s.parameterize
  end

  def generate_sku_prefix
    # Generate SKU prefix from product name
    return if name.blank?
    # Example: "Three Squares T-Shirt" -> "THR-TSHIRT"
    words = name.to_s.upcase.split(/\s+/)
    if words.length > 1
      # Take first 3 letters of first word + first word of second part
      prefix = words[0][0..2] + "-" + words[1..].join("-").gsub(/[^A-Z0-9]/, "")
    else
      # Just use first 3 letters
      prefix = words[0][0..2]
    end
    self.sku_prefix = prefix[0..19] # Limit length
  end

  # Auto-create default variant for product-level inventory AND no-tracking
  def ensure_default_variant
    # Only create default variant for 'product' or 'none' inventory levels
    return unless [ "product", "none" ].include?(inventory_level)
    return if product_variants.exists?(is_default: false) # Has real variants
    return if product_variants.exists?(is_default: true) # Already has default

    Rails.logger.info "🔧 Auto-creating default variant for #{inventory_level} inventory: #{name}"

    # Format: BASE-{id}-DEFAULT — matches generate_sku's BASE-{id}-{variant_key}
    default_sku = "#{(sku_prefix.presence || slug).to_s.upcase}-#{id}-DEFAULT"
    variant = product_variants.new(
      size: "Default",
      sku: default_sku,
      price_cents: base_price_cents,
      available: true,
      stock_quantity: 0, # Not used for product-level or none
      weight_oz: weight_oz || (allow_shipping? ? nil : 0),
      is_default: true
    )
    variant.skip_weight_validation = true unless allow_shipping?
    # Savepoint so a DB-level unique constraint violation doesn't
    # poison the outer product transaction.
    ActiveRecord::Base.transaction(requires_new: true) do
      variant.save!
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    Rails.logger.error "❌ Failed to create default variant: #{e.message}"
    # Don't fail the product save if variant creation fails
  end

  # Handle inventory level changes
  def handle_inventory_level_change
    old_level, new_level = saved_change_to_inventory_level

    case [ old_level, new_level ]
    when [ "product", "variant" ], [ "none", "variant" ]
      # Scenario 1: Product-level/None → Variant-level
      # Delete auto-created default variants (Option A)
      deleted_count = product_variants.where(is_default: true).destroy_all.count
      Rails.logger.info "🗑️  Deleted #{deleted_count} default variant(s) when switching to variant-level for: #{name}"

    when [ "variant", "product" ], [ "variant", "none" ]
      # Scenario 2: Variant-level → Product-level/None
      # Sum variant stock and set product stock (Option C)
      total_stock = product_variants.where(is_default: false).sum(:stock_quantity)
      update_column(:product_stock_quantity, total_stock) if new_level == "product"
      Rails.logger.info "📦 Summed variant stock (#{total_stock}) when switching to #{new_level} for: #{name}"

      # Delete all variants (real + default) when switching away from variant-level
      deleted_count = product_variants.destroy_all.count
      Rails.logger.info "🗑️  Deleted #{deleted_count} variant(s) when switching to #{new_level} for: #{name}"

      # Ensure default variant is created for product/none
      ensure_default_variant

    when [ nil, "product" ], [ "none", "product" ], [ "product", "none" ]
      # Switching between product and none, or new product
      ensure_default_variant
    end
  end

  # HAF-123: Prevent inventory level change if variants are in active carts
  def check_variants_not_in_carts_before_level_change
    return unless inventory_level_changed?
    return unless inventory_level_was == "variant"
    return if inventory_level == "variant"

    # Check if any variants are currently in customer carts
    variant_ids = product_variants.pluck(:id)
    cart_item_count = CartItem.where(product_variant_id: variant_ids).count

    if cart_item_count > 0
      errors.add(:inventory_level, "cannot be changed from 'variant' because #{cart_item_count} cart item(s) reference these variants. Please wait for customers to complete checkout or clear stale carts first.")
    end
  end

  def must_support_at_least_one_fulfillment_type
    return if allow_pickup? || allow_shipping?

    errors.add(:base, "Product must allow pickup, shipping, or both")
  end

  # When a ProductVariant is built on an unsaved Product (e.g., nested
  # attributes), generate_sku uses SecureRandom.hex(4) as the product_id
  # discriminator because product.id is nil. The before_validation callback
  # only fires when sku.blank?, so once set it's never regenerated.
  # This after_create callback replaces any hex-based SKUs with the real
  # product id so SKUs are deterministic and searchable.
  def regenerate_variant_skus_with_id
    product_variants.reload.each do |variant|
      # Temporary discriminators use an "X" prefix (e.g., "X1A2B3C")
      # that can never appear in a real numeric product id. Simple,
      # zero-false-positive detection.
      next unless variant.sku&.match?(/\A.+-X[0-9A-F]{6}-.+\z/i)

      begin
        # Wrap in a savepoint so a DB-level unique constraint violation
        # (RecordNotUnique) doesn't poison the outer product INSERT
        # transaction. Without requires_new, PostgreSQL aborts the entire
        # transaction even though Ruby rescues the exception.
        ActiveRecord::Base.transaction(requires_new: true) do
          variant.sku = nil # Clear so before_validation :generate_sku fires
          variant.save!(validate: true) # Regenerates with real product.id
        end
      rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
        Rails.logger.error "❌ Failed to regenerate SKU for variant #{variant.id}: #{e.message}"
        # Don't roll back the product — a hex SKU is cosmetic, not fatal.
        # SKU can be corrected manually or on next admin save.
      end
    end
  end
end
