# frozen_string_literal: true
namespace :demo do
  task prepare: :environment do
    require Rails.root.join('lib/demo_database')
    name = ActiveRecord::Base.connection_db_config.database.to_s
    abort 'Demo preparation requires the isolated development launcher' unless
      Rails.env.development? && ENV['DEMO_QUEUE'] == '1' && DemoDatabase.valid_name?(name)

    connection = ActiveRecord::Base.connection
    expected = File.read(Rails.root.join('db/queue_schema.rb')).scan(/create_table "([^"]+)"/).flatten
    present = expected.select { |table| connection.table_exists?(table) }
    if present.empty?
      load Rails.root.join('db/queue_schema.rb')
    elsif present.sort != expected.sort
      abort 'Incomplete demo queue schema; use bin/demo reset. Existing tables were preserved.'
    end

    Rake::Task['payments:simulation:seed'].invoke
    # Fictional prices and menu. Never use the production catalog seed.
    [ ['demo-grilled-chicken', 'Grilled chicken bowl', 1350],
      ['demo-roasted-vegetables', 'Roasted vegetable bowl', 1100],
      ['demo-citrus-tea', 'Citrus iced tea', 350] ].each do |slug, label, cents|
      product = Product.find_or_create_by!(slug: slug) do |row|
        row.assign_attributes(name: label, description: 'Fictional demonstration menu; example pricing only.',
          product_type: 'local', published: true, base_price_cents: cents, allow_pickup: true,
          allow_shipping: false, inventory_level: 'product', product_stock_quantity: 500)
      end
      Location.where(slug: %w[simulation-north simulation-south]).each do |location|
        ProductLocation.find_or_create_by!(product: product, location: location)
      end
    end
    # New users bootstrap through the existing ADMIN_EMAILS authenticated path.
    # Existing users keep their Clerk identity and receive the explicit demo role.
    User.where('LOWER(email) = ?', ENV.fetch('DEMO_OWNER_EMAIL').downcase).find_each do |user|
      user.update!(role: 'owner', assigned_location: nil)
    end
    puts 'Fictional demo catalog and presenter access ready. Email/SMS disabled.'
  end
end
