class ProductLocation < ApplicationRecord
  belongs_to :product
  belongs_to :location

  validates :product_id, uniqueness: { scope: :location_id }

  validates :price_override_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validate :unambiguous_price_override

  def unambiguous_price_override
    return if price_override_cents.nil? || product.nil?
    return unless product.product_variants.map(&:price_cents).uniq.size > 1

    errors.add(:base, "This dish has sizes with different prices, so a single #{location&.name || 'location'} price can't be set. Edit each size's price instead.")
  end

  scope :offered, -> { where(offered: true) }
  scope :available, -> { offered.where(available: true) }
end

