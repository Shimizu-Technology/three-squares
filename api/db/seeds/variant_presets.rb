# db/seeds/variant_presets.rb
# Create default variant presets for the flexible variants system
# These presets are based on the old wholesale system

puts "Creating default variant presets..."

presets_data = [
  {
    name: "Youth & Adult Sizes",
    description: "Standard youth and adult size options for apparel",
    option_type: "Size",
    position: 1,
    values: [
      { name: "Youth XS", price_adjustment_cents: 0 },
      { name: "Youth S", price_adjustment_cents: 0 },
      { name: "Youth M", price_adjustment_cents: 0 },
      { name: "Youth L", price_adjustment_cents: 0 },
      { name: "Youth XL", price_adjustment_cents: 0 },
      { name: "Adult S", price_adjustment_cents: 200 },
      { name: "Adult M", price_adjustment_cents: 200 },
      { name: "Adult L", price_adjustment_cents: 200 },
      { name: "Adult XL", price_adjustment_cents: 200 },
      { name: "Adult 2XL", price_adjustment_cents: 400 },
      { name: "Adult 3XL", price_adjustment_cents: 600 }
    ]
  },
  {
    name: "Adult Sizes Only",
    description: "Adult size options for items not available in youth sizes",
    option_type: "Size",
    position: 2,
    values: [
      { name: "S", price_adjustment_cents: 0 },
      { name: "M", price_adjustment_cents: 0 },
      { name: "L", price_adjustment_cents: 0 },
      { name: "XL", price_adjustment_cents: 0 },
      { name: "2XL", price_adjustment_cents: 200 },
      { name: "3XL", price_adjustment_cents: 400 },
      { name: "4XL", price_adjustment_cents: 600 }
    ]
  },
  {
    name: "Standard Colors",
    description: "Basic color options for apparel and accessories",
    option_type: "Color",
    position: 3,
    values: [
      { name: "Black", price_adjustment_cents: 0 },
      { name: "White", price_adjustment_cents: 0 },
      { name: "Navy", price_adjustment_cents: 0 },
      { name: "Gray", price_adjustment_cents: 0 },
      { name: "Red", price_adjustment_cents: 0 },
      { name: "Royal Blue", price_adjustment_cents: 0 },
      { name: "Forest Green", price_adjustment_cents: 0 },
      { name: "Maroon", price_adjustment_cents: 0 }
    ]
  },
  {
    name: "Three Squares Colors",
    description: "Three Squares brand color options",
    option_type: "Color",
    position: 4,
    values: [
      { name: "Red", price_adjustment_cents: 0 },
      { name: "Gold", price_adjustment_cents: 0 },
      { name: "Black", price_adjustment_cents: 0 },
      { name: "White", price_adjustment_cents: 0 }
    ]
  },
  {
    name: "Premium Colors",
    description: "Premium color options with additional cost",
    option_type: "Color",
    position: 5,
    values: [
      { name: "Black", price_adjustment_cents: 0 },
      { name: "White", price_adjustment_cents: 0 },
      { name: "Navy", price_adjustment_cents: 0 },
      { name: "Heather Gray", price_adjustment_cents: 100 },
      { name: "Vintage Red", price_adjustment_cents: 200 },
      { name: "Sunset Orange", price_adjustment_cents: 200 },
      { name: "Electric Blue", price_adjustment_cents: 200 },
      { name: "Forest Green", price_adjustment_cents: 100 },
      { name: "Deep Purple", price_adjustment_cents: 200 },
      { name: "Gold", price_adjustment_cents: 300 }
    ]
  },
  {
    name: "Material Options",
    description: "Different material choices with varying prices",
    option_type: "Material",
    position: 6,
    values: [
      { name: "Cotton", price_adjustment_cents: 0 },
      { name: "Cotton Blend", price_adjustment_cents: 100 },
      { name: "Performance Fabric", price_adjustment_cents: 300 },
      { name: "Organic Cotton", price_adjustment_cents: 200 },
      { name: "Bamboo Blend", price_adjustment_cents: 400 }
    ]
  }
]

presets_data.each do |preset_data|
  preset = VariantPreset.find_or_initialize_by(name: preset_data[:name])
  preset.assign_attributes(preset_data)

  if preset.new_record?
    preset.save!
    puts "  ✓ Created: #{preset.name} (#{preset.values.length} values)"
  else
    preset.save!
    puts "  ✓ Updated: #{preset.name} (#{preset.values.length} values)"
  end
end

puts "Variant presets seeding completed! Total: #{VariantPreset.count} presets"
