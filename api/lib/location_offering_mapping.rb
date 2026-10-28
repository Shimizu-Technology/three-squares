# frozen_string_literal: true
require "csv"

# Validates the entire operator-approved mapping before changing any row.
# No membership is ever inferred from the old daily availability flag.
class LocationOfferingMapping
  HEADERS = %w[location_slug product_slug offered].freeze

  def self.call(path:, apply: false, out: $stdout)
    csv = CSV.read(path, headers: true, encoding: "bom|utf-8")
    raise ArgumentError, "CSV requires exactly #{HEADERS.join(',')} headers" unless csv.headers&.sort == HEADERS.sort
    raise ArgumentError, "CSV is empty" if csv.empty?

    seen = {}
    entries = csv.each_with_index.map do |row, index|
      raise ArgumentError, "Row #{index + 2}: expected exactly three fields" unless row.fields.size == HEADERS.size
      location_slug, product_slug, value = HEADERS.map { |header| row[header].to_s.strip }
      raise ArgumentError, "Row #{index + 2}: offered must be true or false" unless %w[true false].include?(value)
      key = [location_slug, product_slug]
      raise ArgumentError, "Row #{index + 2}: duplicate location/product" if seen[key]
      seen[key] = true
      location = Location.find_by(slug: location_slug)
      product = Product.find_by(slug: product_slug)
      raise ArgumentError, "Row #{index + 2}: unknown location or product slug" unless location && product
      [location, product, value == "true"]
    end
    changed = 0
    Product.transaction do
      entries.sort_by { |location, product, _| [product.id, location.id] }.each do |location, product, offered|
        # Match writes to the same product lock order as sales and admin updates.
        product.lock! if apply
        rows = product.product_locations.to_a
        prior = rows.empty? || rows.any? { |row| row.location_id == location.id && row.offered? }
        changed += 1 if prior != offered
        out.puts "#{apply ? 'APPLY' : 'DRY RUN'} #{location.slug},#{product.slug}: offered #{prior} -> #{offered}"
        LocationOffering.set!(product: product, location: location, offered: offered) if apply
      end
    end
    out.puts "#{entries.size} mappings; #{changed} changes#{apply ? '' : '; no writes (set APPLY=true after operator approval)'}"
    { mappings: entries.size, changed: changed, applied: apply }
  end
end
