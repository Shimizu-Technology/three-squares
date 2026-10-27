# frozen_string_literal: true

# Seed-only photo reconciliation. Never uploads, deletes S3 objects, or changes
# custom image records. Known legacy URL/key pairs are the correction boundary.
module SeedProductPhotos
  LEGACY_IMAGES = {
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
  }.freeze

  # Filename and visual matches in docs/assets/images. Other food images were
  # generic stand-ins (e.g. French Toast was plated5.jpeg, a rice plate).
  VERIFIED_FOOD_SLUGS = %w[
    bleu-cheese-burger
    cheeseburger
    loco-moco
    bread-pudding
    donki-cheeseburger
    catering-charcuterie
    catering-poppers
    catering-salad-cups
    catering-kaddo-small
    catering-bento-mini
    catering-bento-shrimp
    catering-roast-pig
  ].freeze

  # Cookies are disabled for this launch; keep their existing seed behavior and
  # review package-specific photographs with that storefront's future phase.
  def self.cookie?(slug)
    slug.start_with?("cookies-", "passion-fruit-", "pineapple-")
  end

  def self.apply!
    counts = { created: 0, removed: 0 }
    LEGACY_IMAGES.each do |slug, url|
      product = Product.find_by(slug: slug)
      next unless product

      s3_key = url.delete_prefix("https://three-squares.s3.ap-southeast-2.amazonaws.com/")
      if VERIFIED_FOOD_SLUGS.include?(slug) || cookie?(slug)
        next if product.product_images.exists?

        product.product_images.create!(url: url, s3_key: s3_key,
          primary: true, position: 0, alt_text: product.name)
        counts[:created] += 1
      else
        # Correct only this exact seed assignment. A later upload, different
        # URL/key, or an image attached to another dish remains untouched.
        product.product_images.where(url: url, s3_key: s3_key).find_each do |image|
          image.destroy!
          counts[:removed] += 1
        end
      end
    end
    counts
  end
end
