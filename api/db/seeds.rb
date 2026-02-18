# db/seeds.rb
# Seed file for Three Squares / B&G Pacific ordering platform
#
# This file creates:
# - Site settings with B&G Pacific / Three Squares configuration
# - Menu categories and products (Restaurant + Cookies + Catering)
# - Real data from scraped assets

puts "=" * 80
puts "🍽️  SEEDING THREE SQUARES / B&G PACIFIC PLATFORM"
puts "=" * 80
puts ""

# ------------------------------------------------------------------------------
# 1) ADMIN USER
# ------------------------------------------------------------------------------
puts "1️⃣  Admin user setup..."
puts "   ℹ️  Admin users are auto-created when signing in with Clerk."
puts ""

# ------------------------------------------------------------------------------
# 2) SITE SETTINGS
# ------------------------------------------------------------------------------
puts "2️⃣  Configuring site settings..."

settings = SiteSetting.instance

if settings.store_email.blank?
  settings.update!(
    store_name: "Three Squares",
    store_email: "sales@bgpacific.com",
    store_phone: "+1 (671) 646-2652",
    order_notification_emails: ["sales@bgpacific.com"],
    shipping_origin_address: {
      company: "B&G Pacific LLC",
      street1: "416 Chalan San Antonio",
      city: "Tamuning",
      state: "GU",
      zip: "96913",
      country: "US",
      phone: "+1 (671) 646-2652"
    },
    payment_test_mode: Rails.env.production? ? false : true,
    payment_processor: "stripe",
    send_customer_emails: false
  )
  puts "   ✓ Site Settings configured"
else
  puts "   ⏭️  Site Settings already configured"
end
puts ""

# ------------------------------------------------------------------------------
# 3) MENU CATEGORIES
# ------------------------------------------------------------------------------
puts "3️⃣  Setting up menu categories..."

categories = [
  # Three Squares Restaurant Menu
  { name: "Breakfast", slug: "breakfast", description: "Served 8am - 11am", position: 1 },
  { name: "Starters", slug: "starters", description: "Appetizers and small plates", position: 2 },
  { name: "Main Dishes", slug: "mains", description: "Lunch & Dinner entrees", position: 3 },
  { name: "Donki Location", slug: "donki", description: "Three Squares @ Don Quijote menu", position: 4 },
  { name: "Kids Menu", slug: "kids", description: "For the little ones", position: 5 },
  { name: "Sides & Snacks", slug: "sides", description: "Add-ons and quick bites", position: 6 },
  { name: "Desserts", slug: "desserts", description: "Sweet endings", position: 7 },
  { name: "Drinks", slug: "drinks", description: "Cocktails & beverages", position: 8 },
  { name: "Grab & Go", slug: "grab-n-go", description: "Sold by weight - Donki location", position: 9 },
  
  # Latte Stone Cookies
  { name: "Latte Stone Cookies", slug: "cookies", description: "Premium Guam-made shortbread cookies", position: 9 },
  { name: "Cookie Gift Boxes", slug: "cookie-boxes", description: "Assortment boxes and tins", position: 10 },
  { name: "Mini Cookies", slug: "mini-cookies", description: "Bite-sized snacking cookies", position: 11 },
  
  # Catering
  { name: "Catering - Platters", slug: "catering-platters", description: "Family platters for parties", position: 12 },
  { name: "Catering - Bentos", slug: "catering-bentos", description: "Individual boxed meals", position: 13 },
  { name: "Catering - Cocktail", slug: "catering-cocktail", description: "For receptions and events", position: 14 },
  { name: "Catering - Special", slug: "catering-special", description: "Requires 2-3 days notice", position: 15 }
]

categories.each do |cat|
  Collection.find_or_create_by!(slug: cat[:slug]) do |c|
    c.name = cat[:name]
    c.description = cat[:description]
    c.sort_order = cat[:position]
    c.published = true
  end
end

puts "   ✓ Created #{Collection.count} categories"
puts ""

# ------------------------------------------------------------------------------
# 3B) LOCATIONS
# ------------------------------------------------------------------------------
puts "3️⃣  Setting up locations..."

location_seed_data = [
  {
    name: "Three Squares Main",
    slug: "three-squares-main",
    address: "416 Chalan San Antonio, Tamuning, GU 96913",
    phone: "(671) 646-2652",
    hours_json: {
      "Tuesday - Saturday" => "8:00 AM - 8:00 PM",
      "Sunday" => "8:00 AM - 5:00 PM",
      "Monday" => "Closed"
    }
  },
  {
    name: "Three Squares @ Donki",
    slug: "three-squares-donki",
    address: "Inside Don Quijote, Tamuning, GU",
    phone: "(671) 646-2652",
    hours_json: {
      "Daily" => "10:00 AM - 10:00 PM"
    }
  }
]

location_seed_data.each do |attrs|
  location = Location.find_or_initialize_by(slug: attrs[:slug])
  location.update!(attrs.merge(active: true))
end

puts "   ✓ Created #{Location.count} locations"
puts ""

# Collection slugs used for fulfillment/location default logic.
COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze
DONKI_COLLECTION_SLUG = "donki".freeze

# ------------------------------------------------------------------------------
# 4) HELPER METHOD
# ------------------------------------------------------------------------------
def create_product(attrs)
  collection = Collection.find_by(slug: attrs[:collection_slug])
  all_locations = Location.by_name.to_a
  
  # Determine product_type: explicit > requires_shipping > default local
  product_type = if attrs[:product_type]
    attrs[:product_type]
  elsif attrs[:requires_shipping]
    "shippable"
  else
    "local"
  end
  
  product = Product.find_or_create_by!(slug: attrs[:slug]) do |p|
    p.name = attrs[:name]
    p.description = attrs[:description] || ""
    p.base_price_cents = attrs[:price] ? (attrs[:price] * 100).to_i : 0
    p.featured = attrs[:featured] || false
    p.published = true
    p.product_type = product_type
  end

  # Shipping defaults:
  # - explicit allow_shipping wins
  # - then requires_shipping flag
  # - then cookie collections default to shippable
  allow_shipping = if attrs.key?(:allow_shipping)
    attrs[:allow_shipping]
  elsif attrs[:requires_shipping] == true
    true
  else
    COOKIE_COLLECTION_SLUGS.include?(attrs[:collection_slug])
  end
  allow_pickup = attrs.key?(:allow_pickup) ? attrs[:allow_pickup] : true

  default_location_slugs = if attrs[:collection_slug] == DONKI_COLLECTION_SLUG
    [ "three-squares-donki" ]
  else
    [ "three-squares-main" ]
  end
  location_slugs = attrs[:location_slugs] || default_location_slugs
  location_slugs = [] unless allow_pickup

  product.update!(
    name: attrs[:name],
    description: attrs[:description] || "",
    base_price_cents: attrs[:price] ? (attrs[:price] * 100).to_i : 0,
    featured: attrs[:featured] || false,
    published: true,
    product_type: product_type,
    allow_pickup: allow_pickup,
    allow_shipping: allow_shipping
  )
  
  if collection && !product.collections.include?(collection)
    product.collections << collection
  end

  if all_locations.any?
    selected_location_ids = Location.where(slug: location_slugs).pluck(:id)
    all_locations.each do |location|
      record = ProductLocation.find_or_initialize_by(product_id: product.id, location_id: location.id)
      record.available = selected_location_ids.include?(location.id)
      record.save!
    end
  end
  
  product
end

# ------------------------------------------------------------------------------
# 5) THREE SQUARES RESTAURANT MENU
# ------------------------------------------------------------------------------
puts "4️⃣  Seeding Three Squares restaurant menu..."

# BREAKFAST
breakfast_items = [
  { name: "French Toast, Bacon & Eggs", slug: "french-toast-bacon-eggs", price: 12.95, description: "Classic breakfast plate", collection_slug: "breakfast" },
  { name: "Stack O' Cakes", slug: "stack-o-cakes", price: 8.95, description: "Fluffy pancake stack", collection_slug: "breakfast" },
  { name: "French Toast Only", slug: "french-toast-only", price: 9.95, description: "French toast served alone", collection_slug: "breakfast" },
  { name: "Waffles", slug: "waffles", price: 9.95, description: "Golden Belgian waffles", collection_slug: "breakfast" },
  { name: "Chicken & Waffles", slug: "chicken-waffles", price: 14.95, description: "Signature dish - crispy fried chicken with waffles", collection_slug: "breakfast", featured: true },
  { name: "Loco Moco", slug: "loco-moco", price: 13.95, description: "Rice, burger patty, fried egg, gravy", collection_slug: "breakfast" },
  { name: "Corned Beef Hash", slug: "corned-beef-hash", price: 12.95, description: "Classic corned beef hash with eggs", collection_slug: "breakfast" },
  { name: "Biscuits & Gravy", slug: "biscuits-and-gravy", price: 11.95, description: "Fluffy buttermilk biscuits smothered in savory sausage gravy", collection_slug: "breakfast", featured: true }
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

# DONKI LOCATION MENU (Three Squares @ Don Quijote)
donki_items = [
  { name: "Three Squares Fried Chicken", slug: "donki-fried-chicken", price: 10.95, description: "Signature fried chicken plate", collection_slug: "donki", featured: true },
  { name: "Local Burger & Fries", slug: "donki-local-burger", price: 13.95, description: "Island-style burger with fries", collection_slug: "donki" },
  { name: "Classic Cheeseburger & Fries", slug: "donki-cheeseburger", price: 13.95, description: "Classic cheeseburger with fries", collection_slug: "donki" },
  { name: "Smoked Pork w/ Coconut Dinanche", slug: "donki-smoked-pork", price: 10.95, description: "House-smoked pork with traditional sauce", collection_slug: "donki" },
  { name: "Grilled Teriyaki Chicken", slug: "donki-teriyaki-chicken", price: 10.95, description: "Grilled chicken with teriyaki glaze", collection_slug: "donki" },
  { name: "Ground Beef Tinaktak", slug: "donki-tinaktak", price: 12.95, description: "Chamorro beef with coconut milk", collection_slug: "donki" },
  { name: "Homemade Meatloaf w/ Gravy", slug: "donki-meatloaf", price: 12.95, description: "Classic homestyle meatloaf with gravy", collection_slug: "donki" },
  { name: "Fried Parrot Fish Filet", slug: "donki-parrot-fish", price: 13.95, description: "Local fried fish filet", collection_slug: "donki" },
  { name: "Seafood Tinaktak", slug: "donki-seafood-tinaktak", price: 14.95, description: "Seafood in coconut milk sauce", collection_slug: "donki" },
  { name: "Bisteak & Onions", slug: "donki-bisteak", price: 13.95, description: "Grilled steak with caramelized onions", collection_slug: "donki" }
]

# KIDS MENU
kids_items = [
  { name: "Kids Cheese Burger & Fries", slug: "kids-cheeseburger", price: 7.95, description: "Kid-sized cheeseburger with fries", collection_slug: "kids" },
  { name: "Kids Grilled Cheese & Fries", slug: "kids-grilled-cheese", price: 6.95, description: "Grilled cheese sandwich with fries", collection_slug: "kids" },
  { name: "Kids Spaghetti w/ Meat Sauce", slug: "kids-spaghetti", price: 7.95, description: "Spaghetti with homemade meat sauce", collection_slug: "kids" },
  { name: "Kids Teriyaki Chicken w/ Rice", slug: "kids-teriyaki", price: 6.95, description: "Teriyaki chicken with steamed rice", collection_slug: "kids" }
]

# SIDES & SNACKS
sides_items = [
  { name: "Chicken Crunch Tenders", slug: "chicken-tenders", price: 6.95, description: "Crispy chicken tenders", collection_slug: "sides" },
  { name: "Fried Banana Cheesecake w/ Ice Cream", slug: "fried-banana-cheesecake", price: 6.95, description: "Decadent fried banana cheesecake", collection_slug: "sides" },
  { name: "2pc Buchi Buchi", slug: "buchi-buchi", price: 4.50, description: "Sweet sesame rice balls", collection_slug: "sides" },
  { name: "2pc Empanada", slug: "empanada", price: 4.50, description: "Savory meat-filled pastries", collection_slug: "sides" },
  { name: "3pc Fried Pork & Veggie Lumpia", slug: "lumpia-3pc", price: 6.50, description: "Filipino-style egg rolls", collection_slug: "sides" },
  { name: "French Fries", slug: "french-fries", price: 3.95, description: "Crispy golden fries", collection_slug: "sides" },
  { name: "6pc Fried Corn Titiyas", slug: "titiyas", price: 1.50, description: "Traditional Chamorro corn tortillas", collection_slug: "sides" }
]

# DESSERTS
desserts_items = [
  { name: "Bread Pudding Ala Mode", slug: "bread-pudding", price: 8.95, description: "Warm bread pudding with ice cream", collection_slug: "desserts", featured: true },
  { name: "Fried Banana with Ice Cream", slug: "fried-banana", price: 7.95, description: "Crispy fried banana", collection_slug: "desserts" },
  { name: "Coconut Banana Cake", slug: "coconut-banana-cake", price: 7.95, description: "House specialty - highly praised!", collection_slug: "desserts" }
]

# DRINKS
drinks_items = [
  { name: "House Cocktails", slug: "house-cocktails", price: 10.00, description: "Seasonal specialty drinks", collection_slug: "drinks" },
  { name: "Draft Beer", slug: "draft-beer", price: 6.00, description: "Selection of local and imported beers", collection_slug: "drinks" },
  { name: "Calamansi Tea", slug: "calamansi-tea", price: 0.00, description: "Complimentary with meal", collection_slug: "drinks" }
]

# GRAB & GO (Sold by weight at Donki location)
grab_n_go_items = [
  { name: "Champuladu", slug: "grab-champuladu", price: 0.00, description: "Traditional Chamorro chocolate rice pudding", collection_slug: "grab-n-go", product_type: "market_price" },
  { name: "Tropical Sago", slug: "grab-tropical-sago", price: 0.00, description: "Tropical tapioca dessert", collection_slug: "grab-n-go", product_type: "market_price" },
  { name: "Chocolate Coconut Sago", slug: "grab-chocolate-sago", price: 0.00, description: "Rich chocolate coconut tapioca", collection_slug: "grab-n-go", product_type: "market_price" },
  { name: "Broccoli & Crab Salad", slug: "grab-broccoli-crab", price: 0.00, description: "Fresh broccoli and crab salad", collection_slug: "grab-n-go", product_type: "market_price" },
  { name: "Potato Salad", slug: "grab-potato-salad", price: 0.00, description: "Creamy homemade potato salad", collection_slug: "grab-n-go", product_type: "market_price" },
  { name: "Chicken Kelaguen", slug: "grab-chicken-kelaguen", price: 0.00, description: "Traditional Chamorro chicken salad", collection_slug: "grab-n-go", product_type: "market_price" }
]

restaurant_items = breakfast_items + starters_items + mains_items + donki_items + 
                   kids_items + sides_items + desserts_items + drinks_items + grab_n_go_items
restaurant_items.each { |item| create_product(item) }

puts "   ✓ Created #{restaurant_items.count} restaurant menu items"

# ------------------------------------------------------------------------------
# 6) LATTE STONE COOKIES
# ------------------------------------------------------------------------------
puts "5️⃣  Seeding Latte Stone Cookies products..."

# Gift Boxes & Tins
cookie_boxes = [
  { name: "30pc Grand Assortment", slug: "cookies-30pc-grand", price: 37.50, description: "30 individually wrapped cookies - vanilla, chocolate, coconut, mango, pineapple, passionfruit varieties with chocolate dipping", collection_slug: "cookie-boxes", featured: true, requires_shipping: true },
  { name: "20pc Classic Assortment Latte Stone Shape Tin", slug: "cookies-20pc-tin", price: 31.50, description: "20 individually wrapped shortbread cookies in collectible latte stone shape tin", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "9pc Classic Assortment Latte Stone Shape Tin", slug: "cookies-9pc-tin", price: 22.50, description: "9 individually wrapped shortbread cookies in collectible tin", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "12pc Grand Assortment", slug: "cookies-12pc-grand", price: 17.00, description: "12 individually wrapped cookies - 1 of each flavor variety", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "8pc Fruit Assortment", slug: "cookies-8pc-fruit", price: 14.00, description: "8 individually wrapped fruit-flavored cookies - pineapple, passionfruit, coconut, mango", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "6pc Chocolate Dipped Assortment", slug: "cookies-6pc-dipped", price: 11.00, description: "6 individually wrapped chocolate-dipped shortbread cookies", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "3pc Chocolate Dipped Assortment", slug: "cookies-3pc-dipped", price: 5.50, description: "3 individually wrapped chocolate-dipped shortbread cookies - perfect gift", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "Premium Latte Stone Cookie Box (16pc)", slug: "cookies-16pc-premium", price: 21.99, description: "16 individually wrapped latte stone shortbread cookies - 4 of each flavor", collection_slug: "cookie-boxes", featured: true, requires_shipping: true },
  { name: "Medium Latte Stone Cookie Box (10pc)", slug: "cookies-10pc-medium", price: 12.99, description: "10 individually wrapped latte stone shortbread cookies", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "Small Latte Stone Cookie Box (6pc)", slug: "cookies-6pc-small", price: 9.99, description: "6 individually wrapped latte stone shortbread cookies", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "Latte Stone Cookies Box (2pc)", slug: "cookies-2pc-box", price: 2.99, description: "1 vanilla + 1 chocolate latte stone shortbread cookie", collection_slug: "cookie-boxes", requires_shipping: true },
  { name: "10pc Holiday Box", slug: "cookies-10pc-holiday", price: 11.99, description: "Seasonal holiday gift box", collection_slug: "cookie-boxes", requires_shipping: true }
]

# Individual Cookie Flavors
cookie_flavors = [
  { name: "Passion Fruit Latte Stone Cookies (6pc)", slug: "passion-fruit-6pc", price: 8.99, description: "6 individually wrapped passion fruit shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Passion Fruit Latte Stone Cookies (10pc)", slug: "passion-fruit-10pc", price: 11.99, description: "10 individually wrapped passion fruit shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Pineapple Latte Stone Cookies (6pc)", slug: "pineapple-6pc", price: 8.99, description: "6 individually wrapped pineapple shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Pineapple Latte Stone Cookies (10pc)", slug: "pineapple-10pc", price: 11.99, description: "10 individually wrapped pineapple shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Mango Latte Stone Cookies (6pc)", slug: "mango-6pc", price: 8.99, description: "6 individually wrapped mango shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Mango Latte Stone Cookies (10pc)", slug: "mango-10pc", price: 11.99, description: "10 individually wrapped mango shortbread cookies", collection_slug: "cookies", requires_shipping: true },
  { name: "Coconut Latte Stone Cookies (10pc)", slug: "coconut-10pc", price: 12.99, description: "5 milk chocolate dipped + 5 plain coconut shortbread", collection_slug: "cookies", requires_shipping: true },
  { name: "Sling Stone Cookies (8pc)", slug: "slingstone-8pc", price: 9.99, description: "8 chocolate chip cookies with macadamia nuts and coconut flakes", collection_slug: "cookies", requires_shipping: true },
  { name: "Sling Stone Cookies (12pc)", slug: "slingstone-12pc", price: 13.99, description: "12 chocolate chip cookies with macadamia nuts and coconut flakes", collection_slug: "cookies", requires_shipping: true }
]

# Mini Cookies (Snacking)
mini_cookies = [
  { name: "Mini Pineapple Latte Stone Cookies", slug: "mini-pineapple", price: 5.50, description: "Crispy, bite-sized pineapple shortbread cookies - tropical snacking", collection_slug: "mini-cookies", requires_shipping: true },
  { name: "Mini Coconut Latte Stone Cookies", slug: "mini-coconut", price: 5.50, description: "Crispy, bite-sized coconut shortbread cookies - taste of the islands", collection_slug: "mini-cookies", requires_shipping: true },
  { name: "Mini Mango Latte Stone Cookies", slug: "mini-mango", price: 5.50, description: "Crispy, bite-sized mango shortbread cookies - summer flavor", collection_slug: "mini-cookies", requires_shipping: true },
  { name: "Classic Mini Latte Stone Cookies", slug: "mini-classic", price: 5.99, description: "Bite-sized vanilla and chocolate shortbread with chocolate drizzle", collection_slug: "mini-cookies", requires_shipping: true },
  { name: "Mini Chocolate Chip Cookies", slug: "mini-chocolate-chip", price: 5.99, description: "Classic mini chocolate chip cookies - perfect for snacking", collection_slug: "mini-cookies", requires_shipping: true },
  { name: "Mini Slingstone Cookies", slug: "mini-slingstone", price: 6.49, description: "Bite-sized macadamia, coconut, and chocolate chip cookies", collection_slug: "mini-cookies", requires_shipping: true }
]

cookie_items = cookie_boxes + cookie_flavors + mini_cookies
cookie_items.each { |item| create_product(item) }

puts "   ✓ Created #{cookie_items.count} Latte Stone Cookies products"

# ------------------------------------------------------------------------------
# 7) CATERING MENU
# ------------------------------------------------------------------------------
puts "6️⃣  Seeding catering menu..."

# PLATTERS
platters_items = [
  { name: "BBQ Kalbi Shortribs - Small Platter", slug: "catering-kalbi-small", price: 85.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" },
  { name: "BBQ Kalbi Shortribs - Large Platter", slug: "catering-kalbi-large", price: 150.00, description: "Serves 20-30 guests", collection_slug: "catering-platters" },
  { name: "Three Squares Fried Chicken - Small", slug: "catering-chicken-small", price: 65.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" },
  { name: "Three Squares Fried Chicken - Large", slug: "catering-chicken-large", price: 120.00, description: "Serves 20-30 guests", collection_slug: "catering-platters" },
  { name: "Chicken Kelaguen Platter", slug: "catering-kelaguen-platter", price: 55.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" },
  { name: "Tinala Katne Platter", slug: "catering-tinala-platter", price: 75.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" },
  { name: "Whole Fried Parrot Fish", slug: "catering-parrot-fish", price: 95.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" },
  { name: "Seafood Kaddo (Soup) - Small", slug: "catering-kaddo-small", price: 45.00, description: "Serves 10-15 guests", collection_slug: "catering-platters" }
]

# BENTOS
bentos_items = [
  { name: "Standard Bento", slug: "catering-bento-standard", price: 12.00, description: "Choice of protein, rice, and sides", collection_slug: "catering-bentos" },
  { name: "Mini Bento", slug: "catering-bento-mini", price: 8.00, description: "Smaller portion bento box", collection_slug: "catering-bentos" },
  { name: "Breakfast Mini Bento", slug: "catering-bento-breakfast", price: 8.00, description: "Morning meeting option", collection_slug: "catering-bentos" },
  { name: "Shrimp Fried Rice Bento", slug: "catering-bento-shrimp", price: 14.00, description: "Popular choice for events", collection_slug: "catering-bentos", featured: true }
]

# COCKTAIL BUFFET
cocktail_items = [
  { name: "Kelaguen Poppers", slug: "catering-poppers", price: 65.00, description: "25 pieces - perfect for cocktail hour", collection_slug: "catering-cocktail" },
  { name: "Charcuterie Board", slug: "catering-charcuterie", price: 85.00, description: "Serves 10-15 guests", collection_slug: "catering-cocktail" },
  { name: "Mini Salad Cups", slug: "catering-salad-cups", price: 45.00, description: "25 cups", collection_slug: "catering-cocktail" },
  { name: "Assorted Canapes", slug: "catering-canapes", price: 75.00, description: "30 pieces", collection_slug: "catering-cocktail" }
]

# SPECIAL ITEMS
special_items = [
  { name: "Latiya Cake", slug: "catering-latiya", price: 65.00, description: "Traditional Chamorro dessert - requires 2-3 days notice", collection_slug: "catering-special" },
  { name: "Banana Donuts - Platter", slug: "catering-banana-donuts", price: 35.00, description: "24 pieces - requires 2-3 days notice", collection_slug: "catering-special" },
  { name: "Roast Pig Carving", slug: "catering-roast-pig", price: 0.00, description: "Market price - contact for quote", collection_slug: "catering-special" },
  { name: "Shish Kabobs", slug: "catering-shish-kabobs", price: 0.00, description: "Custom order - contact for quote", collection_slug: "catering-special" }
]

catering_items = platters_items + bentos_items + cocktail_items + special_items
catering_items.each { |item| create_product(item) }

puts "   ✓ Created #{catering_items.count} catering menu items"

# ------------------------------------------------------------------------------
# 8) HOMEPAGE SECTIONS
# ------------------------------------------------------------------------------
puts "7️⃣  Setting up homepage sections..."

if HomepageSection.count == 0
  HomepageSection.create!(
    section_type: "hero",
    position: 0,
    active: true,
    title: "Three Squares",
    subtitle: "Good Food, Good Mood, Good Service — Guam-style comfort food & catering by B&G Pacific",
    button_text: "View Menu",
    button_link: "/products",
    background_image_url: "/images/plated1.jpg",
    settings: {
      "overlay_opacity" => 0.4,
      "text_alignment" => "center",
      "badge_text" => "B&G Pacific LLC",
      "secondary_button_text" => "Order Catering",
      "secondary_button_link" => "/catering"
    }
  )

  [
    { title: "Restaurant Menu", subtitle: "Breakfast, lunch, and dinner favorites", button_text: "View Menu", button_link: "/products", image_url: "/images/Cheeseburger.jpg", position: 0 },
    { title: "Latte Stone Cookies", subtitle: "Premium Guam-made shortbread cookies", button_text: "Shop Cookies", button_link: "/products?collection=cookies", image_url: "/images/latte-stone-cookies/30.png", position: 1 },
    { title: "Catering Services", subtitle: "Corporate, government & private events", button_text: "Order Catering", button_link: "/catering", image_url: "/images/catering4.jpg", position: 2 }
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
  puts "   ⏭️  Homepage sections already exist"
end
puts ""

# ------------------------------------------------------------------------------
# 9) PRODUCT IMAGES (S3 URLs)
# ------------------------------------------------------------------------------
puts "8️⃣  Linking product images..."

product_images = {
  "famous-fried-chicken" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/famous-fried-chicken/1770793192_0.JPG",
  "bleu-cheese-burger" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/bleu-cheese-burger/1770793193_0.jpg",
  "cheeseburger" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cheeseburger/1770793194_0.jpg",
  "loco-moco" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/loco-moco/1770793195_0.JPG",
  "bread-pudding" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/bread-pudding/1770793196_0.jpg",
  "chicken-waffles" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/chicken-waffles/1770793869_0.jpg",
  "french-toast-bacon-eggs" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/french-toast-bacon-eggs/1770793871_0.jpeg",
  "stack-o-cakes" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/stack-o-cakes/1770793872_0.jpeg",
  "waffles" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/waffles/1770793873_0.jpeg",
  "french-toast-only" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/french-toast-only/1770793874_0.jpeg",
  "corned-beef-hash" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/corned-beef-hash/1770793875_0.jpg",
  "local-sampler" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/local-sampler/1770793876_0.jpg",
  "chicken-kelaguen" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/chicken-kelaguen/1770793877_0.jpg",
  "fried-lumpia" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/fried-lumpia/1770793877_0.jpg",
  "bbq-kalbi-shortribs" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/bbq-kalbi-shortribs/1770793879_0.jpg",
  "pot-roast" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/pot-roast/1770793881_0.jpg",
  "meatloaf" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/meatloaf/1770793882_0.jpg",
  "teriyaki-chicken" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/teriyaki-chicken/1770793882_0.jpg",
  "tinaktak" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/tinaktak/1770793883_0.jpg",
  "grilled-salmon" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/grilled-salmon/1770793883_0.jpg",
  "teriyaki-salmon" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/teriyaki-salmon/1770793884_0.jpg",
  "philly-cheese-steak" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/philly-cheese-steak/1770793884_0.jpg",
  "donki-fried-chicken" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-fried-chicken/1770793886_0.JPG",
  "donki-cheeseburger" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-cheeseburger/1770793195_0.jpg",
  "donki-local-burger" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-local-burger/1770793888_0.jpg",
  "donki-smoked-pork" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-smoked-pork/1770793888_0.jpg",
  "donki-teriyaki-chicken" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-teriyaki-chicken/1770793889_0.jpg",
  "donki-tinaktak" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-tinaktak/1770793889_0.jpg",
  "donki-meatloaf" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-meatloaf/1770793890_0.jpg",
  "donki-parrot-fish" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-parrot-fish/1770793892_0.jpg",
  "donki-seafood-tinaktak" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-seafood-tinaktak/1770793892_0.jpg",
  "donki-bisteak" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/donki-bisteak/1770793893_0.jpg",
  "kids-cheeseburger" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/kids-cheeseburger/1770793895_0.jpg",
  "kids-grilled-cheese" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/kids-grilled-cheese/1770793896_0.jpeg",
  "kids-spaghetti" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/kids-spaghetti/1770793897_0.jpg",
  "kids-teriyaki" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/kids-teriyaki/1770793897_0.jpg",
  "chicken-tenders" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/chicken-tenders/1770793898_0.JPG",
  "fried-banana-cheesecake" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/fried-banana-cheesecake/1770793898_0.jpg",
  "fried-banana" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/fried-banana/1770793904_0.jpg",
  "coconut-banana-cake" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/coconut-banana-cake/1770793907_0.jpg",
  "house-cocktails" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/house-cocktails/1770793910_0.JPG",
  "draft-beer" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/draft-beer/1770793910_0.JPG",
  # Latte Stone Cookies
  "cookies-30pc-grand" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-30pc-grand/1770793204_0.png",
  "cookies-20pc-tin" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-20pc-tin/1770793221_0.png",
  "cookies-9pc-tin" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-9pc-tin/1770793236_0.png",
  "cookies-12pc-grand" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-12pc-grand/1770793256_0.png",
  "cookies-8pc-fruit" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-8pc-fruit/1770793392_0.png",
  "cookies-6pc-dipped" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-6pc-dipped/1770793406_0.png",
  "cookies-3pc-dipped" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-3pc-dipped/1770793419_0.jpg",
  "cookies-16pc-premium" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-16pc-premium/1770793425_0.jpg",
  "cookies-10pc-medium" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-10pc-medium/1770793427_0.jpg",
  "cookies-6pc-small" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-6pc-small/1770794117_0.jpg",
  "cookies-2pc-box" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-2pc-box/1770794118_0.jpg",
  "cookies-10pc-holiday" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/cookies-10pc-holiday/1770794120_0.png",
  "passion-fruit-6pc" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/passion-fruit-6pc/1770794137_0.png",
  "passion-fruit-10pc" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/passion-fruit-10pc/1770794398_0.png",
  "pineapple-6pc" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/pineapple-6pc/1770794411_0.jpg",
  # Catering
  "catering-charcuterie" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-charcuterie/1770793197_0.JPG",
  "catering-poppers" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-poppers/1770793198_0.jpg",
  "catering-salad-cups" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-salad-cups/1770793198_0.jpg",
  "catering-kaddo-small" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-kaddo-small/1770793199_0.jpg",
  "catering-bento-mini" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-bento-mini/1770793200_0.jpg",
  "catering-bento-shrimp" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-bento-shrimp/1770793202_0.jpeg",
  "catering-roast-pig" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-roast-pig/1770793203_0.JPG",
  "catering-kalbi-small" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-kalbi-small/1770793911_0.jpg",
  "catering-kalbi-large" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-kalbi-large/1770793919_0.jpg",
  "catering-chicken-small" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-chicken-small/1770793927_0.JPG",
  "catering-chicken-large" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-chicken-large/1770793928_0.JPG",
  "catering-kelaguen-platter" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-kelaguen-platter/1770793928_0.jpg",
  "catering-tinala-platter" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-tinala-platter/1770793933_0.jpg",
  "catering-parrot-fish" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-parrot-fish/1770793938_0.jpg",
  "catering-bento-standard" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-bento-standard/1770793940_0.jpg",
  "catering-bento-breakfast" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-bento-breakfast/1770793943_0.jpg",
  "catering-canapes" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-canapes/1770793947_0.jpg",
  "catering-latiya" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-latiya/1770793947_0.jpg",
  "catering-banana-donuts" => "https://three-squares.s3.ap-southeast-2.amazonaws.com/products/catering-banana-donuts/1770793949_0.jpg"
}

images_created = 0
product_images.each do |slug, url|
  product = Product.find_by(slug: slug)
  next unless product
  
  # Skip if product already has images
  next if product.product_images.exists?
  
  # Extract s3_key from URL
  s3_key = url.gsub("https://three-squares.s3.ap-southeast-2.amazonaws.com/", "")
  
  ProductImage.create!(
    product: product,
    url: url,
    s3_key: s3_key,
    primary: true,
    position: 0,
    alt_text: product.name
  )
  images_created += 1
end

puts "   ✓ Linked #{images_created} product images"
puts ""

# ------------------------------------------------------------------------------
# 9B) DEFAULT VARIANT BACKFILL (POS/checkout stability)
# ------------------------------------------------------------------------------
puts "9️⃣  Backfilling missing default variants..."

missing_variant_products = Product
  .where(inventory_level: [ "none", "product" ])
  .left_joins(:product_variants)
  .where(product_variants: { id: nil })

backfilled_variant_count = 0
missing_variant_products.find_each do |product|
  default_sku = "#{(product.sku_prefix.presence || product.slug).to_s.upcase}-DEFAULT-P#{product.id}"
  variant = product.product_variants.new(
    size: "Default",
    sku: default_sku,
    price_cents: product.base_price_cents || 0,
    available: true,
    stock_quantity: 0,
    weight_oz: product.weight_oz,
    is_default: true
  )
  variant.skip_weight_validation = true
  variant.save!
  backfilled_variant_count += 1
end

puts "   ✓ Backfilled #{backfilled_variant_count} default variants"
puts ""

# ------------------------------------------------------------------------------
# 10) DATA QUALITY CHECKS
# ------------------------------------------------------------------------------
puts "9️⃣  Running fulfillment/location data checks..."

donki_location = Location.find_by(slug: "three-squares-donki")

shipping_enabled_products = Product.where(allow_shipping: true)
shipping_non_cookie = shipping_enabled_products
  .left_joins(:collections)
  .where.not(collections: { slug: COOKIE_COLLECTION_SLUGS })
  .distinct

donki_products_with_wrong_location = if donki_location
  Product
    .joins(:collections)
    .where(collections: { slug: DONKI_COLLECTION_SLUG })
    .joins(:product_locations)
    .where(product_locations: { available: true })
    .where.not(product_locations: { location_id: donki_location.id })
    .distinct
else
  Product.none
end

puts "   • Shipping-enabled products: #{shipping_enabled_products.count}"
puts "   • Shipping-enabled non-cookie products: #{shipping_non_cookie.count}"
puts "   • Donki products available outside Donki: #{donki_products_with_wrong_location.count}"

if shipping_non_cookie.exists?
  puts "   ⚠️  Non-cookie shippable products found: #{shipping_non_cookie.limit(5).pluck(:slug).join(', ')}"
end
if donki_products_with_wrong_location.exists?
  puts "   ⚠️  Donki location mapping issues found: #{donki_products_with_wrong_location.limit(5).pluck(:slug).join(', ')}"
end

puts "   ✓ Data checks complete"
puts ""

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
total_products = Product.count
puts "=" * 80
puts "✅ SEED COMPLETE"
puts "=" * 80
puts ""
puts "📊 Summary:"
puts "   • Store: Three Squares (B&G Pacific LLC)"
puts "   • Categories: #{Collection.count}"
puts "   • Total Products: #{total_products}"
puts "     - Restaurant Menu: #{restaurant_items.count}"
puts "     - Latte Stone Cookies: #{cookie_items.count}"
puts "     - Catering: #{catering_items.count}"
puts "   • Homepage Sections: #{HomepageSection.count}"
puts ""
puts "📞 Contact:"
puts "   • Phone: (671) 646-2652"
puts "   • WhatsApp: (671) 864-6656"
puts "   • Email: sales@bgpacific.com"
puts ""
puts "🍽️  Ready to serve!"
puts "=" * 80
