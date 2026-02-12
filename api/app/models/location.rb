class Location < ApplicationRecord
  has_many :product_locations, dependent: :destroy
  has_many :products, through: :product_locations
  has_many :orders, dependent: :nullify

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  scope :active, -> { where(active: true) }
  scope :by_name, -> { order(:name) }
end

