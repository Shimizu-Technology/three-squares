class Location < ApplicationRecord
  has_many :product_locations, dependent: :destroy
  has_many :products, through: :product_locations
  has_many :orders, dependent: :nullify

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true
  before_validation :normalize_schedule
  validate { errors.add(:hours_json, @schedule_error) if @schedule_error }

  scope :active, -> { where(active: true) }
  scope :by_name, -> { order(:name) }

  def accepting_orders_at?(time)
    active? && LocationSchedule.open_at?(hours_json, time)
  end

  def accepting_orders_now?
    accepting_orders_at?(Time.current)
  end

  private

  def normalize_schedule
    @schedule_error = nil
    self.hours_json = LocationSchedule.normalize(hours_json)
  rescue ArgumentError => error
    @schedule_error = error.message
  end
end

