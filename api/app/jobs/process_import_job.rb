require "csv"
require "open-uri"
require "set"

class ProcessImportJob < ApplicationJob
  queue_as :default

  def perform(import_id, products_csv_path, inventory_csv_path = nil)
    import = Import.find(import_id)
    import.processing!

    Rails.logger.info "🚀 Starting import ##{import.id}"

    begin
      stats = {
        products_created: 0,
        variants_created: 0,
        variants_skipped: 0,  # Track skipped variants (missing SKU, etc.)
        images_created: 0,
        collections_created: 0,
        products_skipped: 0,
        warnings: [],
        created_products: [], # Track names of created products
        variants_with_default_weight: [] # Track variants that used default 8oz weight
      }

      # Parse products CSV
      csv_data = CSV.read(products_csv_path, headers: true, encoding: "UTF-8")

      # Group rows by Handle (Shopify format)
      products_data = {}
      csv_data.each do |row|
        handle = row["Handle"]
        products_data[handle] ||= []
        products_data[handle] << row
      end

      Rails.logger.info "📦 Found #{products_data.keys.length} unique products in CSV"

      # Prime import progress tracking
      total_products = products_data.keys.length
      import.update_progress(processed: 0, total: total_products, step: "Preparing import")

      # Cache collections by slug to avoid repetitive lookups
      collection_cache = Collection.all.index_by(&:slug)

      # Process each product
      processed_products = 0
      products_data.each do |handle, rows|
        begin
          product_name = process_product(rows, stats, collection_cache)
          processed_products += 1
          import.update_progress(
            processed: processed_products,
            total: total_products,
            step: product_name ? "Processed #{product_name}" : "Processed #{processed_products} of #{total_products}"
          )
        rescue => e
          Rails.logger.error "❌ Failed to process product #{handle}: #{e.message}"
          stats[:warnings] << "ERROR processing #{handle}: #{e.message}"
          # Don't increment skip count here - only in process_product when intentionally skipping
          processed_products += 1
          import.update_progress(
            processed: processed_products,
            total: total_products,
            step: "Skipped #{handle} due to error"
          )
        end
      end

      # Parse inventory CSV if provided
      # NOTE: This feature is disabled in the UI until we receive real inventory data
      # TODO: Test with actual inventory export before enabling
      if inventory_csv_path.present? && File.exist?(inventory_csv_path)
        update_inventory(inventory_csv_path, stats)
      end

      stats[:total_collections] = Collection.count
      Rails.logger.info "✅ Import complete: #{stats}"
      import.complete!(stats)

    rescue => e
      Rails.logger.error "❌ Import failed: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      import.fail!(e.message)
    ensure
      # Clean up temporary files
      File.delete(products_csv_path) if File.exist?(products_csv_path)
      File.delete(inventory_csv_path) if inventory_csv_path && File.exist?(inventory_csv_path)
    end
  end

  private

  def process_product(rows, stats, collection_cache)
    first_row = rows.first
    handle = first_row["Handle"]
    has_variant_sku = rows.any? { |r| r["Variant SKU"].present? }

    # Check if product exists (only check active products, ignore archived)
    existing_product = Product.active.find_by(slug: handle)
    if existing_product
      Rails.logger.info "⏭️  Skipping existing product: #{first_row['Title']}"
      stats[:products_skipped] += 1
      stats[:warnings] << "Product already exists: #{first_row['Title']}"
      return
    end

    # Check if an archived product exists with this slug
    archived_product = Product.archived.find_by(slug: handle)
    if archived_product
      Rails.logger.info "📦 Found archived product, unarchiving and updating: #{first_row['Title']}"

      # Unarchive the product
      archived_product.update!(
        archived: false,
        published: first_row["Status"] == "active",
        name: first_row["Title"],
        description: first_row["Body (HTML)"],
        base_price_cents: (first_row["Variant Price"].to_f * 100).to_i,
        weight_oz: (first_row["Variant Grams"].to_f / 28.3495).round(2),
        vendor: first_row["Vendor"],
        product_type: first_row["Type"],
        featured: false,
        needs_attention: !has_variant_sku,
        import_notes: has_variant_sku ? nil : "⚠️ Auto-generated SKUs — original Shopify data had no SKUs for this product. Please verify variant SKUs and update with your real naming convention."
      )

      # Update collections (tags + metadata)
      archived_product.collections.clear
      existing_collection_ids = Set.new
      assign_tag_collections(first_row, archived_product, collection_cache, existing_collection_ids, stats)
      assign_metadata_collections(first_row, archived_product, collection_cache, existing_collection_ids, stats)

      stats[:products_created] += 1
      stats[:created_products] << "#{archived_product.name} (unarchived)"
      stats[:warnings] << "Unarchived and updated: #{first_row['Title']}"

      # Use the unarchived product for variant processing
      product = archived_product

      # Continue to variant processing below
    else
      # Create new product (skip auto-default variant callback during import)
      product = Product.create!(
        name: first_row["Title"],
        slug: handle,
        description: first_row["Body (HTML)"],
        base_price_cents: (first_row["Variant Price"].to_f * 100).to_i,
        weight_oz: (first_row["Variant Grams"].to_f / 28.3495).round(2),
        sku_prefix: first_row["Variant SKU"]&.split("-")&.first,
        vendor: first_row["Vendor"],
        product_type: first_row["Type"],
        published: first_row["Status"] == "active",
        featured: false,
        inventory_level: "none", # Default to no tracking
        product_stock_quantity: 0,
        needs_attention: !has_variant_sku,
        import_notes: has_variant_sku ? nil : "⚠️ Auto-generated SKUs — original Shopify data had no SKUs for this product. Please verify variant SKUs and update with your real naming convention."
      )

      # Manually remove auto-created default variant if any real variants exist in CSV
      # (The after_save callback creates a default before we add real variants)
      has_real_variants = rows.any? { |r| r["Variant SKU"].present? }
      if has_real_variants && product.product_variants.where(is_default: true).exists?
        product.product_variants.where(is_default: true).destroy_all
        Rails.logger.info "🗑️  Removed auto-created default variant (has real variants)"
      end

      Rails.logger.info "✅ Created product: #{product.name}"
      stats[:products_created] += 1
      stats[:created_products] << product.name # Track created product name

      # Create collections from tags + metadata (gender, age, type)
      existing_collection_ids = Set.new
      assign_tag_collections(first_row, product, collection_cache, existing_collection_ids, stats)
      assign_metadata_collections(first_row, product, collection_cache, existing_collection_ids, stats)
    end

    # Process variants
    variants_for_this_product = 0
    skipped_for_missing_sku = 0
    missing_options_count = 0

    existing_variant_skus = ProductVariant.where(sku: rows.map { |r| r["Variant SKU"] }.compact).pluck(:sku).to_set

    auto_sku_counter = 0
    rows.each do |row|
      sku = row["Variant SKU"]
      auto_generated = false

      # Auto-generate SKU if missing (instead of skipping)
      if sku.blank?
        size_part = (row["Option1 Value"] || "default").upcase.gsub(/[^A-Z0-9]/, "")
        sku = "AUTO-#{handle.upcase.gsub(/[^A-Z0-9]/, '')[0..20]}-#{size_part}-#{auto_sku_counter}"
        auto_sku_counter += 1
        auto_generated = true
        Rails.logger.info "🔧 Auto-generated SKU for #{product.name} - #{row['Option1 Value']}: #{sku}"
      end

      # Check for existing variant
      if existing_variant_skus.include?(sku)
        Rails.logger.info "⏭️  Skipping existing variant: #{sku}"
        stats[:variants_skipped] += 1
        next
      end

      # Handle weight - use Shopify grams or default to 8oz
      variant_grams = row["Variant Grams"].to_f
      weight_oz = nil
      used_default_weight = false

      if variant_grams > 0
        weight_oz = (variant_grams / 28.3495).round(2)
      else
        # Default to 8oz if no weight provided
        weight_oz = 8.0
        used_default_weight = true
        Rails.logger.info "⚖️  No weight for #{product.name} - #{row['Option1 Value']}, using default 8oz"
      end

      options = build_variant_options(row)
      missing_options_count += 1 if options.blank?
      legacy_attrs = legacy_variant_attrs(row, options)

      variant = product.product_variants.new(
        sku: sku,
        size: legacy_attrs[:size],
        color: legacy_attrs[:color],
        material: legacy_attrs[:material],
        price_cents: (row["Variant Price"].to_f * 100).to_i,
        compare_at_price_cents: row["Variant Compare At Price"].present? ? (row["Variant Compare At Price"].to_f * 100).to_i : nil,
        cost_cents: 0,
        stock_quantity: 0,
        available: true,
        is_default: false,
        weight_oz: weight_oz,
        options: options
      )
      # Skip weight validation during import (we're setting defaults)
      variant.skip_weight_validation = true
      variant.save!

      variants_for_this_product += 1
      stats[:variants_created] += 1
      existing_variant_skus.add(sku)

      # Track variants with default weight for flagging
      if used_default_weight
        stats[:variants_with_default_weight] ||= []
        stats[:variants_with_default_weight] << { product: product.name, variant: row["Option1 Value"] || sku }
      end

      if auto_generated
        skipped_for_missing_sku += 1 # Reuse counter for tracking auto-generated count
      end
    end

    # Remove auto-created default variant if we created real variants
    if variants_for_this_product > 0 && product.product_variants.where(is_default: true).exists?
      product.product_variants.where(is_default: true).destroy_all
      Rails.logger.info "🗑️  Removed auto-created default variant (variants imported)"
    end

    # Flag products with variants that used default weight
    variants_needing_attention = (stats[:variants_with_default_weight] || []).select { |v| v[:product] == product.name }
    if variants_needing_attention.any?
      variant_names = variants_needing_attention.map { |v| v[:variant] }.join(", ")
      weight_note = "⚖️ Variant(s) imported without weight - using default 8oz: #{variant_names}"

      # Append to existing import_notes or create new
      existing_notes = product.import_notes.presence || ""
      new_notes = [ existing_notes, weight_note ].reject(&:blank?).join("\n")

      product.update!(
        needs_attention: true,
        import_notes: new_notes
      )

      stats[:warnings] << "#{product.name}: #{variants_needing_attention.count} variant(s) imported without weight — using default 8oz"
    end

    # Warn about auto-generated SKUs
    if skipped_for_missing_sku > 0
      stats[:warnings] << "#{product.name}: Auto-generated #{skipped_for_missing_sku} SKU(s) — admin should verify and update with real SKUs"
    end

    if missing_options_count > 0
      options_note = "⚠️ #{missing_options_count} variant(s) imported without option labels (size/color). Please review and update variants."
      existing_notes = product.import_notes.presence || ""
      new_notes = [ existing_notes, options_note ].reject(&:blank?).join("\n")
      product.update!(needs_attention: true, import_notes: new_notes)
      stats[:warnings] << "#{product.name}: #{missing_options_count} variant(s) missing option labels"
    end

    # Warn if product has no variants after processing (critical issue!)
    if product.product_variants.reload.count == 0
      stats[:warnings] << "⚠️ CRITICAL: #{product.name} has NO variants - product cannot be purchased!"
      Rails.logger.error "❌ Product #{product.name} has NO variants after import!"
    end

    # Download and upload images (in parallel batches for speed)
    image_urls = rows.map { |r| r["Image Src"] }.compact.uniq.reject { |url| skip_image?(url) }

    # Use parallel batches (5 at a time to avoid rate limits)
    image_mutex = Mutex.new
    position_counter = product.product_images.count

    image_urls.each_slice(5) do |batch_urls|
      threads = batch_urls.map do |url|
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            begin
              # Download image with timeouts
              file = URI.open(url, read_timeout: 30, open_timeout: 10)
              filename = File.basename(URI.parse(url).path)

              # Upload to S3
              blob = ActiveStorage::Blob.create_and_upload!(
                io: file,
                filename: filename,
                content_type: file.content_type
              )

              # Thread-safe creation of ProductImage
              image_mutex.synchronize do
                is_primary = product.product_images.empty?
                product.product_images.create!(
                  s3_key: blob.key,
                  alt_text: product.name,
                  primary: is_primary,
                  position: position_counter
                )
                position_counter += 1
                stats[:images_created] += 1
              end

              Rails.logger.info "📷 Downloaded image: #{filename}"
            rescue => e
              Rails.logger.warn "⚠️  Failed to download image #{url}: #{e.message}"
              image_mutex.synchronize do
                stats[:warnings] << "Failed to download image: #{File.basename(url)}"
              end
            end
          end
        end
      end

      # Wait for this batch to complete before starting next batch
      threads.each(&:join)
    end

    # Fix $0 base price if needed
    if product.base_price_cents == 0 && product.product_variants.any?
      min_price = product.product_variants.minimum(:price_cents)
      product.update!(base_price_cents: min_price) if min_price > 0
    end

    product.name
  end

  # Assign collections based on CSV tags (existing behavior, extracted to method)
  def assign_tag_collections(row, product, collection_cache, existing_collection_ids, stats)
    tags = row["Tags"]&.split(",")&.map(&:strip) || []
    tags.each do |tag_name|
      next if tag_name.blank?
      slug = tag_name.parameterize
      collection = find_or_create_collection(slug, tag_name, collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end
  end

  def build_variant_options(row)
    options = {}
    [
      [ "Option1 Name", "Option1 Value" ],
      [ "Option2 Name", "Option2 Value" ],
      [ "Option3 Name", "Option3 Value" ]
    ].each do |name_key, value_key|
      name = row[name_key].to_s.strip
      value = row[value_key].to_s.strip
      next if name.blank? || value.blank?

      normalized_name = normalize_option_name(name)
      next if normalized_name.blank?

      normalized_value = normalize_option_value(normalized_name, value)
      next if normalized_value.blank?

      options[normalized_name] = normalized_value
    end

    if options.empty?
      inferred_size = infer_size_from_row(row)
      options["Size"] = inferred_size if inferred_size.present?
    end

    options
  end

  def infer_size_from_row(row)
    option_value = row["Option1 Value"].to_s.strip
    variant_title = row["Variant Title"].to_s.strip

    candidate = option_value
    if candidate.blank? || ProductVariant.size_like_default?(candidate)
      candidate = variant_title
    end

    return nil if candidate.blank? || ProductVariant.size_like_default?(candidate)

    size = ProductVariant.extract_size_from_text(candidate)
    return size if size.present?

    # As a last fallback, try SKU
    ProductVariant.extract_size_from_text(row["Variant SKU"].to_s)
  end

  def legacy_variant_attrs(row, options)
    size = options["Size"]
    if size.blank? && default_title_option?(row)
      size = "One Size"
    end

    {
      size: size,
      color: options["Color"],
      material: options["Material"]
    }
  end

  def normalize_option_name(name)
    return nil if name.blank?

    normalized = name.strip
    return nil if normalized.casecmp("title").zero?

    if normalized.match?(/size/i)
      "Size"
    elsif normalized.match?(/color|colour/i)
      "Color"
    elsif normalized.match?(/material/i)
      "Material"
    else
      normalized
    end
  end

  def normalize_option_value(option_name, value)
    return nil if value.blank?

    if option_name == "Size"
      ProductVariant.normalize_size_token(value)
    else
      value
    end
  end

  def default_title_option?(row)
    name = row["Option1 Name"].to_s.strip
    value = row["Option1 Value"].to_s.strip
    return false unless name.casecmp("title").zero?

    value.casecmp("default title").zero? || value.casecmp("default").zero?
  end

  # Assign collections based on Shopify metadata fields (gender, age group, product type)
  def assign_metadata_collections(row, product, collection_cache, existing_collection_ids, stats)
    gender = row["Target gender (product.metafields.shopify.target-gender)"]&.downcase&.strip || ""
    age_group = row["Age group (product.metafields.shopify.age-group)"]&.downcase&.strip || ""
    product_type = row["Type"]&.strip || ""

    # Gender → Mens/Womens collections
    # Tokenize to avoid substring bugs ("female".include?("male") == true)
    # Unisex products go in BOTH (mirrors Shopify site behavior)
    gender_tokens = gender.split(/[;,\/\s]+/).map(&:strip)
    is_unisex = gender_tokens.include?("unisex")
    if is_unisex || gender_tokens.include?("male")
      collection = find_or_create_collection("mens", "Mens", collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end
    if is_unisex || gender_tokens.include?("female")
      collection = find_or_create_collection("womens", "Womens", collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end

    # Age group → Youth collection for kids
    if age_group == "kids"
      collection = find_or_create_collection("youth", "Youth", collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end

    # Product Type → type-based collections
    # Map types to collection names matching Shopify site structure
    type_mapping = {
      "T-Shirt"     => { slug: "t-shirts",    name: "T-Shirts" },
      "Button Up"   => { slug: "button-ups",   name: "Button-Ups" },
      "Polo"        => { slug: "polos",         name: "Polos" },
      "Long Sleeve" => { slug: "long-sleeves",  name: "Long Sleeves" },
      "Tank Top"    => { slug: "tank-tops",     name: "Tank Tops" },
      "Shorts"      => { slug: "shorts",        name: "Shorts" },
      "Snapback"    => { slug: "hats",          name: "Hats" },
      "Baseball Cap" => { slug: "hats",         name: "Hats" },
      "Sticker"     => { slug: "accessories",   name: "Accessories" },
      "Jacket"      => { slug: "jackets",       name: "Jackets" }
    }

    if product_type.present? && type_mapping[product_type]
      mapping = type_mapping[product_type]
      collection = find_or_create_collection(mapping[:slug], mapping[:name], collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end

    # Master "Apparel" collection for all clothing (not accessories/stickers)
    non_apparel_types = %w[Sticker]
    if product_type.present? && !non_apparel_types.include?(product_type)
      collection = find_or_create_collection("apparel", "Apparel", collection_cache, stats)
      link_product_to_collection(product, collection, existing_collection_ids)
    end
  end

  # Find or create a collection by slug
  def find_or_create_collection(slug, name, collection_cache, stats)
    collection = collection_cache[slug]
    unless collection
      collection = Collection.create!(
        name: name,
        slug: slug,
        published: true
      )
      collection_cache[slug] = collection
      stats[:collections_created] += 1
      Rails.logger.info "📁 Created collection: #{name} (#{slug})"
    end
    collection
  end

  # Link a product to a collection (idempotent)
  def link_product_to_collection(product, collection, existing_collection_ids)
    unless existing_collection_ids.include?(collection.id)
      product.product_collections.create!(collection_id: collection.id)
      existing_collection_ids.add(collection.id)
    end
  end

  def skip_image?(url)
    return true if url.blank?

    # Skip known logo/placeholder images
    skip_patterns = [
      "ChristmasPua.png",
      "ThreeSquaresLogo",
      "logo",
      "placeholder"
    ]

    skip_patterns.any? { |pattern| url.downcase.include?(pattern.downcase) }
  end

  def update_inventory(inventory_csv_path, stats)
    Rails.logger.info "📊 Updating inventory from CSV"

    csv_data = CSV.read(inventory_csv_path, headers: true, encoding: "UTF-8")

    csv_data.each do |row|
      sku = row["SKU"]
      quantity = row["Quantity"].to_i

      variant = ProductVariant.find_by(sku: sku)
      if variant
        variant.update!(stock_quantity: quantity)
        # Update product inventory level to variant tracking
        variant.product.update!(inventory_level: "variant") unless variant.product.inventory_level == "variant"
      end
    end

    Rails.logger.info "✅ Inventory updated"
  end
end
