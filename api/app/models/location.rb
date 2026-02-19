class Location < ApplicationRecord
  LOCATION_TYPES = %w[ permanent popup event ].freeze

  has_many :product_locations, dependent: :destroy
  has_many :products, through: :product_locations
  has_many :orders, dependent: :nullify
  belongs_to :menu_collection, class_name: "Collection", optional: true

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true
  validates :location_type, inclusion: { in: LOCATION_TYPES }
  validate :ends_at_after_starts_at, if: -> { temporary? && starts_at.present? && ends_at.present? }

  scope :active, -> { where(active: true) }
  scope :by_name, -> { order(:name) }
  scope :permanent, -> { where(location_type: "permanent") }
  scope :popups, -> { where(location_type: "popup") }
  scope :events, -> { where(location_type: "event") }
  scope :customer_visible, -> {
    active
      .where("starts_at IS NULL OR starts_at <= ?", Time.current)
      .where("ends_at IS NULL OR ends_at >= ?", Time.current)
  }

  # Class methods
  def self.auto_deactivate_expired!
    where(auto_deactivate: true, active: true)
      .where("ends_at < ?", Time.current)
      .update_all(active: false)
  end

  # Instance methods
  def deactivate!
    update!(active: false)
  end

  def activate!
    update!(active: true)
  end

  def popup?
    location_type == "popup"
  end

  def event?
    location_type == "event"
  end

  def permanent?
    location_type == "permanent"
  end

  def temporary?
    popup? || event?
  end

  def expired?
    ends_at.present? && ends_at < Time.current
  end

  private

  def ends_at_after_starts_at
    if ends_at <= starts_at
      errors.add(:ends_at, "must be after starts_at")
    end
  end
end
