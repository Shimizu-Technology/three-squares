# db/seeds.rb
# Seed file for Three Squares ordering platform
#
# This file creates:
# - Site settings with Three Squares configuration
# - Menu categories and products
# - Catering menu items

puts "=" * 80
puts "🍽️  SEEDING THREE SQUARES ORDERING PLATFORM"
puts "=" * 80
puts ""

# ------------------------------------------------------------------------------
# 1) ADMIN USER (Auto-created on first sign-in)
# ------------------------------------------------------------------------------
puts "1️⃣  Admin user setup..."
puts "   ℹ️  Admin users are auto-created when signing in with Clerk."
puts "   ℹ️  To manually grant admin access, run in Rails console:"
puts "      User.find_by(email: 'user@example.com')&.update!(role: 'admin')"
puts ""

# ------------------------------------------------------------------------------
# 2) SITE SETTINGS
# ------------------------------------------------------------------------------
puts "2️⃣  Configuring site settings..."

settings = SiteSetting.instance

# Only update if settings are using defaults (no store_email set)
if settings.store_email.blank?
  settings.update!(
    # Store Info
    store_name: "Three Squares",
    store_email: "sales@bgpacific.com",
    store_phone: "+1 (671) 646-2652",

    # Order Notifications (admin emails to receive order alerts)
    order_notification_emails: [ "sales@bgpacific.com" ],

    # Shipping Origin (for rate calculations - not used for restaurant)
    shipping_origin_address: {
      company: "Three Squares",
      street1: "416 Chalan San Antonio",
      street2: "",
      city: "Tamuning",
      state: "GU",
      zip: "96913",
      country: "US",
      phone: "+1 (671) 646-2652"
    },

    # Payment Settings
    payment_test_mode: Rails.env.production? ? false : true,
    payment_processor: "stripe",

    # Email Settings
    send_customer_emails: false
  )
  puts "   ✓ Site Settings configured with Three Squares defaults"
else
  puts "   ⏭️  Site Settings already configured (skipping)"
end

puts "   • Store: #{settings.store_name}"
puts "   • Email: #{settings.store_email}"
puts "   • Phone: #{settings.store_phone}"
puts ""

# ------------------------------------------------------------------------------
# 3) MENU CATEGORIES (Collections)
# ------------------------------------------------------------------------------
puts "3️⃣  Setting up menu categories..."

categories = [
  { name: "Breakfast", slug: "breakfast", description: "Served 8am - 11am", position: 1 },
  { name: "Starters", slug: "starters", description: "Appetizers and small plates", position: 2 },
  { name: "Main Dishes", slug: "mains", description: "Lunch & Dinner entrees", position: 3 },
  { name: "Desserts", slug: "desserts", description: "Sweet endings", position: 4 },
  { name: "Drinks", slug: "drinks", description: "Cocktails & beverages", position: 5 },
  { name: "Catering - Platters", slug: "catering-platters", description: "Family platters for parties", position: 6 },
  { name: "Catering - Bentos", slug: "catering-bentos", description: "Individual boxed meals", position: 7 },
  { name: "Catering - Cocktail", slug: "catering-cocktail", description: "For receptions and events", position: 8 },
  { name: "Catering - Special", slug: "catering-special", description: "Requires 2-3 days notice", position: 9 }
]

categories.each do |cat|
  Collection.find_or_create_by!(slug: cat[:slug]) do |c|
    c.name = cat[:name]
    c.description = cat[:description]
    c.position = cat[:position]
    c.active = true
  end
end

puts "   ✓ Created #{Collection.count} menu categories"
puts ""

# ------------------------------------------------------------------------------
# 4) MENU PRODUCTS
# ------------------------------------------------------------------------------
puts "4️⃣  Seeding menu items..."

# Helper to create products
def create_product(attrs)
  collection = Collection.find_by(slug: attrs[:collection_slug])
  
  product = Product.find_or_create_by!(slug: attrs[:slug]) do |p|
    p.name = attrs[:name]
    p.description = attrs[:description] || ""
    p.price_cents = (attrs[:price] * 100).to_i
    p.featured = attrs[:featured] || false
    p.active = true
    p.available_for_sale = true
    p.requires_shipping = false
  end
  
  # Associate with collection
  if collection && !product.collections.include?(collection)
    product.collections << collection
  end
  
  product
end

# BREAKFAST (Served 8am - 11am)
breakfast_items = [
  { name: "French Toast, Bacon & Eggs", slug: "french-toast-bacon-eggs", price: 12.95, description: "Classic breakfast plate", collection_slug: "breakfast" },
  { name: "Stack O' Cakes", slug: "stack-o-cakes", price: 8.95, description: "Fluffy pancake stack", collection_slug: "breakfast" },
  { name: "French Toast Only", slug: "french-toast-only", price: 9.95, description: "French toast served alone", collection_slug: "breakfast" },
  { name: "Waffles", slug: "waffles", price: 9.95, description: "Golden Belgian waffles", collection_slug: "breakfast" },
  { name: "Chicken & Waffles", slug: "chicken-waffles", price: 14.95, description: "Signature dish - crispy fried chicken with waffles", collection_slug: "breakfast", featured: true },
  { name: "Loco Moco", slug: "loco-moco", price: 13.95, description: "Rice, burger patty, fried egg, gravy", collection_slug: "breakfast" },
  { name: "Corned Beef Hash", slug: "corned-beef-hash", price: 12.95, description: "Classic corned beef hash with eggs", collection_slug: "breakfast" }
]

# STARTERS
starters_items = [
  { name: "The Local Sampler", slug: "local-sampler", price: 21.95, description: "Tinala katne, chicken kelaguen, lumpia, titiyas", collection_slug: "starters" },
  { name: "Tinala Katne Appetizer", slug: "tinala-katne-appetizer", price: 14.50, description: "Smoked meat Chamorro style", collection_slug: "starters" },
  { name: "Tinala Katne Fries", slug: "tinala-katne-fries", price: 8.95, description: "Fries topped with tinala katne", collection_slug: "starters" },
  { name: "Smoked Pork Appetizer", slug: "smoked-pork-appetizer", price: 12.95, description: "House-smoked pork", collection_slug: "starters" },
  { name: "Three Squares Nachos", slug: "three-squares-nachos", price: 10.95, description: "Loaded nachos", collection_slug: "starters" },
  { name: "Chicken Kelaguen", slug: "chicken-kelaguen", price: 9.95, description: "Traditional Chamorro chicken salad", collection_slug: "starters" },
  { name: "Fried Lumpia", slug: "fried-lumpia", price: 4.95, description: "Filipino-style egg rolls", collection_slug: "starters" },
  { name: "Soup of the Day", slug: "soup-of-the-day", price: 5.95, description: "Ask your server", collection_slug: "starters" }
]

# MAIN DISHES
mains_items = [
  { name: "Three Squares Famous Fried Chicken", slug: "famous-fried-chicken", price: 15.95, description: "Our signature crispy fried chicken - highly praised!", collection_slug: "mains", featured: true },
  { name: "Pot Roast", slug: "pot-roast", price: 16.95, description: "Slow-cooked tender pot roast", collection_slug: "mains" },
  { name: "Meatloaf", slug: "meatloaf", price: 14.95, description: "Classic homestyle meatloaf", collection_slug: "mains" },
  { name: "BBQ Kalbi Shortribs", slug: "bbq-kalbi-shortribs", price: 18.95, description: "Korean-style marinated short ribs", collection_slug: "mains", featured: true },
  { name: "Teriyaki Chicken", slug: "teriyaki-chicken", price: 14.95, description: "Grilled chicken with teriyaki glaze", collection_slug: "mains" },
  { name: "Tinaktak", slug: "tinaktak", price: 14.95, description: "Chamorro beef with coconut milk", collection_slug: "mains" },
  { name: "Veggie Tinaktak", slug: "veggie-tinaktak", price: 13.95, description: "Vegetarian version with coconut milk", collection_slug: "mains" },
  { name: "Estufao", slug: "estufao", price: 15.95, description: "Filipino-style braised meat", collection_slug: "mains" },
  { name: "Grilled Salmon", slug: "grilled-salmon", price: 19.95, description: "Fresh grilled salmon fillet", collection_slug: "mains" },
  { name: "Teriyaki Salmon", slug: "teriyaki-salmon", price: 19.95, description: "Salmon with teriyaki glaze", collection_slug: "mains" },
  { name: "Salmon Tinaktak Style", slug: "salmon-tinaktak", price: 19.95, description: "Salmon in coconut milk sauce", collection_slug: "mains" },
  { name: "Philly Cheese Steak Sandwich", slug: "philly-cheese-steak", price: 14.95, description: "Classic Philly with peppers and onions", collection_slug: "mains" },
  { name: "Bleu Cheese Burger", slug: "bleu-cheese-burger", price: 14.95, description: "Gourmet burger with bleu cheese", collection_slug: "mains" },
  { name: "Cheeseburger", slug: "cheeseburger", price: 12.95, description: "Classic cheeseburger", collection_slug: "mains" }
]

# DESSERTS
desserts_items = [
  { name: "Bread Pudding Ala Mode", slug: "bread-pudding", price: 8.95, description: "Warm bread pudding with ice cream", collection_slug: "desserts" },
  { name: "Fried Banana with Ice Cream", slug: "fried-banana", price: 7.95, description: "Crispy fried banana", collection_slug: "desserts" },
  { name: "Coconut Banana Cake", slug: "coconut-banana-cake", price: 7.95, description: "House specialty - highly praised!", collection_slug: "desserts", featured: true }
]

# DRINKS
drinks_items = [
  { name: "House Cocktails", slug: "house-cocktails", price: 10.00, description: "Seasonal specialty drinks", collection_slug: "drinks" },
  { name: "Draft Beer", slug: "draft-beer", price: 6.00, description: "Selection of local and imported beers", collection_slug: "drinks" },
  { name: "Calamansi Tea", slug: "calamansi-tea", price: 0.00, description: "Complimentary with meal", collection_slug: "drinks" }
]

# CATERING - PLATTERS
platters_items = [
  { name: "BBQ Kalbi Shortribs - Small Platter", slug: "catering-kalbi-small", price: 85.00, description: "Serves 10-15", collection_slug: "catering-platters" },
  { name: "BBQ Kalbi Shortribs - Large Platter", slug: "catering-kalbi-large", price: 150.00, description: "Serves 20-30", collection_slug: "catering-platters" },
  { name: "Three Squares Fried Chicken - Small", slug: "catering-chicken-small", price: 65.00, description: "Serves 10-15", collection_slug: "catering-platters" },
  { name: "Three Squares Fried Chicken - Large", slug: "catering-chicken-large", price: 120.00, description: "Serves 20-30", collection_slug: "catering-platters" },
  { name: "Chicken Kelaguen Platter", slug: "catering-kelaguen-platter", price: 55.00, description: "Serves 10-15", collection_slug: "catering-platters" },
  { name: "Tinala Katne Platter", slug: "catering-tinala-platter", price: 75.00, description: "Serves 10-15", collection_slug: "catering-platters" },
  { name: "Whole Fried Parrot Fish", slug: "catering-parrot-fish", price: 95.00, description: "Serves 10-15", collection_slug: "catering-platters" },
  { name: "Seafood Kaddo (Soup) - Small", slug: "catering-kaddo-small", price: 45.00, description: "Serves 10-15", collection_slug: "catering-platters" }
]

# CATERING - BENTOS
bentos_items = [
  { name: "Standard Bento", slug: "catering-bento-standard", price: 12.00, description: "Choice of protein, rice, and sides", collection_slug: "catering-bentos" },
  { name: "Mini Bento", slug: "catering-bento-mini", price: 8.00, description: "Smaller portion bento box", collection_slug: "catering-bentos" },
  { name: "Breakfast Mini Bento", slug: "catering-bento-breakfast", price: 8.00, description: "Morning meeting option", collection_slug: "catering-bentos" },
  { name: "Shrimp Fried Rice Bento", slug: "catering-bento-shrimp", price: 14.00, description: "Popular choice", collection_slug: "catering-bentos", featured: true }
]

# CATERING - COCKTAIL
cocktail_items = [
  { name: "Kelaguen Poppers", slug: "catering-poppers", price: 65.00, description: "25 pieces", collection_slug: "catering-cocktail" },
  { name: "Charcuterie Board", slug: "catering-charcuterie", price: 85.00, description: "Serves 10-15", collection_slug: "catering-cocktail" },
  { name: "Mini Salad Cups", slug: "catering-salad-cups", price: 45.00, description: "25 cups", collection_slug: "catering-cocktail" },
  { name: "Assorted Canapes", slug: "catering-canapes", price: 75.00, description: "30 pieces", collection_slug: "catering-cocktail" }
]

# CATERING - SPECIAL (2-3 days notice)
special_items = [
  { name: "Latiya Cake", slug: "catering-latiya", price: 65.00, description: "Traditional Chamorro dessert", collection_slug: "catering-special" },
  { name: "Banana Donuts - Platter", slug: "catering-banana-donuts", price: 35.00, description: "24 pieces", collection_slug: "catering-special" }
]

all_items = breakfast_items + starters_items + mains_items + desserts_items + drinks_items + 
            platters_items + bentos_items + cocktail_items + special_items

all_items.each { |item| create_product(item) }

puts "   ✓ Created #{Product.count} menu items"
puts ""

# ------------------------------------------------------------------------------
# 5) HOMEPAGE SECTIONS
# ------------------------------------------------------------------------------
puts "5️⃣  Setting up homepage sections..."

if HomepageSection.count == 0
  # Hero Section
  HomepageSection.create!(
    section_type: "hero",
    position: 0,
    active: true,
    title: "Three Squares",
    subtitle: "Good Food, Good Mood, Good Service — Guam-style comfort food & catering",
    button_text: "Order Now",
    button_link: "/products",
    background_image_url: "/images/three-squares-hero.jpg",
    settings: {
      "overlay_opacity" => 0.4,
      "text_alignment" => "center",
      "badge_text" => "B&G Pacific LLC",
      "secondary_button_text" => "View Catering Menu",
      "secondary_button_link" => "/catering"
    }
  )

  # Category Cards
  [
    {
      title: "Restaurant Menu",
      subtitle: "Breakfast, lunch, and dinner favorites",
      button_text: "View Menu",
      button_link: "/products",
      image_url: "/images/three-squares-menu.jpg",
      position: 0
    },
    {
      title: "Catering Services",
      subtitle: "Platters, bentos, and cocktail buffets",
      button_text: "Order Catering",
      button_link: "/catering",
      image_url: "/images/three-squares-catering.jpg",
      position: 1
    }
  ].each do |card|
    HomepageSection.create!(
      section_type: "category_card",
      position: card[:position],
      active: true,
      title: card[:title],
      subtitle: card[:subtitle],
      button_text: card[:button_text],
      button_link: card[:button_link],
      image_url: card[:image_url]
    )
  end

  puts "   ✓ Created #{HomepageSection.count} homepage sections"
else
  puts "   ⏭️  Homepage sections already exist (#{HomepageSection.count} sections)"
end
puts ""

# ------------------------------------------------------------------------------
# 6) INSTRUCTIONS
# ------------------------------------------------------------------------------
puts "6️⃣  Next steps:"
puts ""
puts "   💡 To add product images, use the Admin dashboard:"
puts "      1. Sign in with Clerk"
puts "      2. Go to Admin > Products"
puts "      3. Edit each product and upload images"
puts ""
if settings.payment_test_mode?
  puts "   ⚠️  Payment is in TEST MODE - no real charges will be made"
  puts "      To enable real payments, update payment_test_mode in Admin > Settings"
  puts ""
end

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
puts "=" * 80
puts "✅ SEED COMPLETE"
puts "=" * 80
puts ""
puts "📊 Summary:"
puts "   • Store: Three Squares"
puts "   • Categories: #{Collection.count}"
puts "   • Menu Items: #{Product.count}"
puts "   • Homepage Sections: #{HomepageSection.count}"
puts ""
puts "🍽️  Ready to serve!"
puts "=" * 80
