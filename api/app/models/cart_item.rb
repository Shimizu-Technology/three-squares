class CartItem < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :product_variant

  validates :quantity, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :product_variant_id, uniqueness: { scope: :user_id, message: "already in cart" }, if: :user_id?
  validates :product_variant_id, uniqueness: { scope: :session_id, message: "already in cart" }, if: :session_id?
  validate :user_or_session_present

  before_validation :ensure_positive_quantity

  # Scopes
  scope :for_user, ->(user) { where(user: user) }
  scope :for_session, ->(session_id) { where(session_id: session_id) }

  # Check if item is still available (respects inventory_level)
  def available?
    product = product_variant.product

    # If no inventory tracking, always available
    return true if product.inventory_level == "none"

    # Otherwise check actual availability
    product_variant.actually_available? &&
      (product.inventory_level == "product" ?
        product.product_stock_quantity >= quantity :
        product_variant.stock_quantity >= quantity)
  end

  # Get available quantity for this item (respects inventory_level)
  def available_quantity
    product = product_variant.product

    case product.inventory_level
    when "none"
      999 # High number for "unlimited"
    when "product"
      product.product_stock_quantity || 0
    when "variant"
      product_variant.stock_quantity
    else
      0
    end
  end

  # Check if quantity needs to be reduced (respects inventory_level)
  def quantity_exceeds_stock?
    product = product_variant.product

    return false if product.inventory_level == "none"

    quantity > available_quantity
  end

  # Get max quantity user can have (respects inventory_level)
  def max_available_quantity
    product = product_variant.product

    return 999 if product.inventory_level == "none"

    [ quantity, available_quantity ].min
  end

  # Calculate subtotal for this cart item
  def subtotal_cents(location_id: nil)
    quantity * product_variant.effective_unit_price_cents(location_id: location_id)
  end

  def subtotal
    Money.new(subtotal_cents, "USD")
  end

  # Get product info (for convenience)
  def product
    product_variant.product
  end

  private

  def user_or_session_present
    if user_id.blank? && session_id.blank?
      errors.add(:base, "Either user or session must be present")
    end
  end

  def ensure_positive_quantity
    self.quantity = 1 if quantity.nil? || quantity < 1
  end
end
