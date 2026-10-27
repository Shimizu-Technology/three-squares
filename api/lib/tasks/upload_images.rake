namespace :images do
  desc "Upload local images to S3 and link to products"
  task upload_to_s3: :environment do
    abort "This legacy upload task is disabled: its dish mappings include incorrect photos. Review docs/CATALOG-PHOTOS.md and use an approved, dish-specific upload workflow."
  end

  desc "List all product images"
  task list: :environment do
    ProductImage.includes(:product).find_each do |img|
      puts "#{img.product.slug}: #{img.url} (primary: #{img.primary})"
    end
  end
end
