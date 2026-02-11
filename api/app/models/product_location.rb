class ProductLocation < ApplicationRecord
  belongs_to :product
  belongs_to :location

  validates :product_id, uniqueness: { scope: :location_id }

  scope :available, -> { where(available: true) }
end

