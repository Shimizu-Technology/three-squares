# frozen_string_literal: true

# Membership changes serialize with sale reservation/finalization product locks.
# Daily availability and legacy price overrides are deliberately preserved.
class LocationOffering
  def self.materialize_legacy!(product)
    return if product.product_locations.exists?

    Location.find_each { |location| product.product_locations.create!(location: location, offered: true, available: true) }
  end

  def self.set!(product:, location:, offered:)
    raise ArgumentError, "offered must be boolean" unless [true, false].include?(offered)

    product.with_lock do
      materialize_legacy!(product)
      row = product.product_locations.find_by(location: location)
      if row
        row.update_columns(offered: offered, updated_at: Time.current) unless row.offered == offered
      else
        row = product.product_locations.create!(location: location, offered: offered, available: true)
      end
      row
    end
  end
end
