namespace :images do
  desc "Upload local images to S3 and link to products"
  task upload_to_s3: :environment do
    require 'aws-sdk-s3'

    # Configure S3 client
    s3_client = Aws::S3::Client.new(
      region: ENV.fetch('AWS_REGION', 'ap-southeast-2'),
      access_key_id: ENV['AWS_ACCESS_KEY_ID'],
      secret_access_key: ENV['AWS_SECRET_ACCESS_KEY']
    )
    bucket = ENV.fetch('AWS_S3_BUCKET', 'three-squares')

    # Image directory (from assets)
    assets_dir = File.expand_path('~/work/three-squares-assets/images')
    
    puts "=" * 60
    puts "📸 Uploading images to S3"
    puts "=" * 60
    puts "Bucket: #{bucket}"
    puts "Region: #{ENV['AWS_REGION']}"
    puts ""

    # Product image mappings (product_slug => [image_files])
    image_mappings = {
      # Three Squares food
      'famous-fried-chicken' => ['BBQ_Chicken.JPG'],
      'bleu-cheese-burger' => ['Bleu_Chz_Burger.jpg'],
      'cheeseburger' => ['Cheeseburger.jpg'],
      'donki-cheeseburger' => ['Cheeseburger.jpg'],
      'loco-moco' => ['Loco_Moco.JPG'],
      'bread-pudding' => ['bread_pudding_ala_mode.jpg'],
      'catering-charcuterie' => ['Charcutterie_Board.JPG'],
      'catering-poppers' => ['Cocktail_Stations_-_Assorted_Poppers.jpg'],
      'catering-salad-cups' => ['Cocktail_Stations_-_Mini_Crudite_and_Mini_Salad_Cups.jpg'],
      'catering-kaddo-small' => ['Seafood_Kaddo_-_Small_Platter.jpg'],
      'catering-bento-mini' => ['Mini_Bentos.jpg'],
      'catering-bento-shrimp' => ['Bulk_Bento_-_Shrimp_Fried_Rice.jpeg'],
      'catering-roast-pig' => ['Roast_Pig.JPG'],
      
      # Latte Stone Cookies
      'cookies-30pc-grand' => ['latte-stone-cookies/31.png', 'latte-stone-cookies/WhatsApp_Image_2025-09-05_at_7.16.37_PM_2.jpg'],
      'cookies-20pc-tin' => ['latte-stone-cookies/30.png'],
      'cookies-9pc-tin' => ['latte-stone-cookies/29.png', 'latte-stone-cookies/WhatsApp_Image_2025-08-21_at_10.16.50_AM.jpg'],
      'cookies-12pc-grand' => ['latte-stone-cookies/27.png', 'latte-stone-cookies/28.png'],
      'cookies-8pc-fruit' => ['latte-stone-cookies/26.png', 'latte-stone-cookies/WhatsApp_Image_2025-09-05_at_7.16.38_PM_1.jpg'],
      'cookies-6pc-dipped' => ['latte-stone-cookies/25.png'],
      'cookies-3pc-dipped' => ['latte-stone-cookies/WhatsApp_Image_2025-09-05_at_7.16.38_PM_2.jpg'],
      'cookies-16pc-premium' => ['latte-stone-cookies/WhatsApp_Image_2025-08-21_at_10.16.49_AM.jpg'],
      'cookies-10pc-medium' => ['latte-stone-cookies/WhatsApp_Image_2025-08-21_at_10.16.49_AM_1.jpg'],
    }

    uploaded_count = 0
    error_count = 0

    image_mappings.each do |product_slug, image_files|
      product = Product.find_by(slug: product_slug)
      unless product
        puts "⚠️  Product not found: #{product_slug}"
        next
      end

      image_files.each_with_index do |image_file, index|
        local_path = File.join(assets_dir, image_file)
        
        unless File.exist?(local_path)
          puts "⚠️  File not found: #{local_path}"
          error_count += 1
          next
        end

        # Generate S3 key
        ext = File.extname(image_file)
        s3_key = "products/#{product_slug}/#{Time.now.to_i}_#{index}#{ext}"

        begin
          # Upload to S3
          File.open(local_path, 'rb') do |file|
            content_type = case ext.downcase
              when '.jpg', '.jpeg' then 'image/jpeg'
              when '.png' then 'image/png'
              when '.gif' then 'image/gif'
              when '.webp' then 'image/webp'
              else 'application/octet-stream'
            end

            s3_client.put_object(
              bucket: bucket,
              key: s3_key,
              body: file,
              content_type: content_type
            )
          end

          # Generate public URL
          s3_url = "https://#{bucket}.s3.#{ENV['AWS_REGION']}.amazonaws.com/#{s3_key}"

          # Create ProductImage record
          ProductImage.create!(
            product: product,
            url: s3_url,
            s3_key: s3_key,
            primary: index == 0,
            position: index,
            alt_text: product.name
          )

          puts "✓ #{product_slug}: #{image_file} → S3"
          uploaded_count += 1

        rescue Aws::S3::Errors::ServiceError => e
          puts "✗ S3 Error for #{image_file}: #{e.message}"
          error_count += 1
        rescue => e
          puts "✗ Error for #{image_file}: #{e.message}"
          error_count += 1
        end
      end
    end

    puts ""
    puts "=" * 60
    puts "✅ Upload complete!"
    puts "   Uploaded: #{uploaded_count}"
    puts "   Errors: #{error_count}"
    puts "=" * 60
  end

  desc "List all product images"
  task list: :environment do
    ProductImage.includes(:product).find_each do |img|
      puts "#{img.product.slug}: #{img.url} (primary: #{img.primary})"
    end
  end
end
