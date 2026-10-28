require Rails.root.join("lib/location_offering_mapping")

namespace :catalog do
  desc "Preview approved CSV location_slug,product_slug,offered mapping (FILE=...; APPLY=true to write)"
  task map_offerings: :environment do
    abort "Supply FILE=/absolute/path/to/approved.csv" if ENV["FILE"].blank?
    abort "APPLY must be true or false" if ENV["APPLY"].present? && !%w[true false].include?(ENV["APPLY"])
    LocationOfferingMapping.call(path: ENV.fetch("FILE"), apply: ENV["APPLY"] == "true")
  end
end
