class Location < ApplicationRecord
  has_many :product_locations, dependent: :destroy
  has_many :products, through: :product_locations
  has_many :admin_devices, dependent: :nullify
  has_many :orders, dependent: :nullify

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true
  before_validation :normalize_schedule, if: :schedule_changing?
  validate :validate_schedule, if: :schedule_changing?

  scope :active, -> { where(active: true) }
  scope :by_name, -> { order(:name) }

  def accepting_orders_at?(time)
    active? && LocationSchedule.open_at?(hours_json, time)
  end

  def accepting_orders_now?
    accepting_orders_at?(Time.current)
  end

  def normalized_hours
    LocationSchedule.normalize(hours_json)
  rescue ArgumentError
    LocationSchedule::DAYS.index_with { "Closed" }
  end

  private

  def schedule_changing?
    new_record? || will_save_change_to_hours_json?
  end

  def validate_schedule
    errors.add(:hours_json, @schedule_error) if @schedule_error
  end

  def normalize_schedule
    @schedule_error = nil
    self.hours_json = LocationSchedule.normalize(hours_json)
  rescue ArgumentError => error
    @schedule_error = error.message
  end
end

