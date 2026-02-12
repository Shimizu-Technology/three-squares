class OrderItem < ApplicationRecord
  belongs_to :order
  belongs_to :product, optional: true
  belongs_to :product_variant, optional: true

  # Validations
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_price_cents, numericality: { greater_than_or_equal_to: 0 }
  validates :total_price_cents, numericality: { greater_than_or_equal_to: 0 }
  validates :product_name, presence: true  # Required since product is optional

  # Callbacks
  before_validation :set_defaults, if: :new_record?
  before_validation :calculate_total

  # Money handling
  def unit_price
    Money.new(unit_price_cents || 0, "USD")
  end

  def total_price
    Money.new(total_price_cents || 0, "USD")
  end

  # Display helpers
  def display_name
    if product_variant
      "#{product_name} - #{variant_name}"
    else
      product_name
    end
  end

  private

  def set_defaults
    if product
      self.product_name ||= product.name
      self.variant_name ||= product_variant&.display_name
      self.product_sku ||= product_variant&.sku || product.sku_prefix
      self.unit_price_cents ||= product_variant&.price_cents || product.base_price_cents || 0
    end
  end

  def calculate_total
    self.total_price_cents = (unit_price_cents || 0) * (quantity || 0)
  end
end
