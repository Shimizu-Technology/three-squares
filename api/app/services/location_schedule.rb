class LocationSchedule
  DAYS = Date::DAYNAMES.freeze
  ZONE = "Pacific/Guam".freeze

  def self.normalize(raw)
    raise ArgumentError, "must be a day-to-hours object" unless raw.is_a?(Hash)
    return DAYS.index_with { "Closed" } if raw.empty?

    entries = {}
    raw.each do |key, value|
      days, priority = days_for(key)
      hours = normalize_hours(value)
      days.each do |day|
        previous = entries[day]
        if previous && previous.first == priority && previous.last != hours
          raise ArgumentError, "has conflicting hours for #{day}"
        end
        entries[day] = [priority, hours] unless previous && previous.first > priority
      end
    end
    missing = DAYS - entries.keys
    raise ArgumentError, "is missing #{missing.join(', ')}" if missing.any?

    DAYS.index_with { |day| entries.fetch(day).last }
  end

  def self.open_at?(raw, time)
    hours = normalize(raw)
    local = time.in_time_zone(ZONE)
    minute = local.hour * 60 + local.min
    today = windows(hours.fetch(DAYS[local.wday]))
    yesterday = windows(hours.fetch(DAYS[(local.wday - 1) % 7]))
    today.any? { |open, close| minute >= open && (close < open || minute < close) } ||
      yesterday.any? { |open, close| close < open && minute < close }
  rescue ArgumentError, TypeError
    false
  end

  def self.days_for(key)
    key = key.to_s.strip.downcase
    return [DAYS, 0] if key.in?(%w[daily everyday]) || key == "every day"

    pieces = key.split(/\s*[-–—]\s*/)
    day = ->(value) { DAYS.find { |name| [name.downcase, name[0, 3].downcase].include?(value) } }
    first = day.call(pieces.first)
    last = day.call(pieces.last)
    raise ArgumentError, "has an unknown day: #{key}" unless first && last && pieces.length <= 2
    return [[first], 2] if pieces.length == 1

    start = DAYS.index(first)
    finish = DAYS.index(last)
    range = finish >= start ? (start..finish).to_a : (start..6).to_a + (0..finish).to_a
    [range.map { |index| DAYS[index] }, 1]
  end

  def self.normalize_hours(value)
    raise ArgumentError, "hours must be text" unless value.is_a?(String)
    return "Closed" if value.strip.match?(/\A(closed|close|off|n\/a|na)\z/i)

    windows(value).map do |open, close|
      "#{format('%02d:%02d', open / 60, open % 60)} - #{format('%02d:%02d', close / 60, close % 60)}"
    end.join("; ")
  end

  def self.windows(value)
    return [] if value == "Closed"
    parts = value.to_s.split(/\s*[;,]\s*/, -1)
    raise ArgumentError, "hours must contain an opening and closing time" if parts.empty?

    parts.map do |window|
      endpoints = window.strip.split(/\s*[-–—]\s*/, -1)
      raise ArgumentError, "invalid time window: #{window}" unless endpoints.length == 2
      open = minutes(endpoints.first)
      close = minutes(endpoints.last, closing: true)
      raise ArgumentError, "opening and closing times must differ" if open == close
      [open, close]
    end
  end

  def self.minutes(value, closing: false)
    text = value.strip
    return 1440 if closing && text == "24:00"
    match = text.match(/\A(\d{1,2})(?::(\d{2}))?\s*(am|pm)\z/i)
    if match
      hour, minute = match[1].to_i, (match[2] || "0").to_i
      raise ArgumentError, "invalid time: #{text}" unless hour.between?(1, 12) && minute.between?(0, 59)
      return (hour % 12 + (match[3].casecmp?("pm") ? 12 : 0)) * 60 + minute
    end
    match = text.match(/\A(\d{1,2}):(\d{2})\z/)
    unless match && match[1].to_i.between?(0, 23) && match[2].to_i.between?(0, 59)
      raise ArgumentError, "invalid time: #{text}"
    end
    match[1].to_i * 60 + match[2].to_i
  end
  private_class_method :days_for, :normalize_hours, :windows, :minutes
end
