class Location < ApplicationRecord
  WEEKDAY_NAMES = Date::DAYNAMES.freeze

  has_many :product_locations, dependent: :destroy
  has_many :products, through: :product_locations
  has_many :orders, dependent: :nullify
  has_many :admin_devices, dependent: :nullify

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  scope :active, -> { where(active: true) }
  scope :by_name, -> { order(:name) }

  def accepting_orders_now?
    accepting_orders_at?(Time.zone.now)
  end

  def accepting_orders_at?(time)
    schedule = todays_hours_for(time)
    return true if schedule.nil?
    return false if schedule.blank?

    normalized = schedule.to_s.strip
    return false if normalized.blank?
    return false if normalized.match?(/\A(closed|close|off|n\/a|na)\z/i)

    current_minutes = time.hour * 60 + time.min
    normalized.split(/\s*[;,]\s*/).any? do |window|
      open_minutes, close_minutes = parse_window(window)
      next false unless open_minutes && close_minutes

      if close_minutes <= open_minutes
        current_minutes >= open_minutes || current_minutes < close_minutes
      else
        current_minutes >= open_minutes && current_minutes < close_minutes
      end
    end
  end

  private

  def todays_hours_for(time)
    raw_hours = (hours_json || {}).to_h
    return nil if raw_hours.values.all?(&:blank?)

    day_name = WEEKDAY_NAMES[time.wday]
    raw_hours[day_name] || raw_hours[day_name.downcase] || raw_hours[day_name.upcase]
  end

  def parse_window(window)
    match = window.to_s.strip.match(/\A(.+?)\s*-\s*(.+)\z/)
    return [ nil, nil ] unless match

    [
      parse_minutes(match[1]),
      parse_minutes(match[2])
    ]
  end

  def parse_minutes(value)
    parsed = Time.zone.strptime(value.to_s.strip.upcase, "%I:%M %p")
  rescue ArgumentError
    parsed = Time.zone.strptime(value.to_s.strip.upcase, "%I %p")
    parsed.hour * 60 + parsed.min
  else
    parsed.hour * 60 + parsed.min
  end
end
