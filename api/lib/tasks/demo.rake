# frozen_string_literal: true
namespace :demo do
  task prepare: :environment do
    require Rails.root.join('lib/demo_database')
    name = ActiveRecord::Base.connection_db_config.database.to_s
    abort 'Demo preparation requires the isolated development launcher' unless
      Rails.env.development? && ENV['DEMO_QUEUE'] == '1' && DemoDatabase.valid_name?(name)

    catalog = ENV.fetch('DEMO_CATALOG', 'three-squares')
    abort 'Choose --catalog three-squares or fictional' unless %w[three-squares fictional].include?(catalog)
    metadata = ActiveRecord::Base.connection_pool.internal_metadata
    previous_catalog = metadata['demo_catalog']
    if (previous_catalog.present? && previous_catalog != catalog) || (previous_catalog.blank? && Product.exists?)
      abort 'Use bin/demo reset with the selected --catalog before changing or upgrading the demo catalog.'
    end

    connection = ActiveRecord::Base.connection
    expected = File.read(Rails.root.join('db/queue_schema.rb')).scan(/create_table "([^"]+)"/).flatten
    present = expected.select { |table| connection.table_exists?(table) }
    if present.empty?
      load Rails.root.join('db/queue_schema.rb')
    elsif present.sort != expected.sort
      abort 'Incomplete demo queue schema; use bin/demo reset. Existing tables were preserved.'
    end

    if catalog == 'three-squares'
      # The checked-in seed only writes local records and stores image URLs.
      # It must finish before the simulator overrides its provider/settings.
      Rake::Task['db:seed'].invoke
      identity = Payments::Simulation::Fixtures.identity!
      locations = Location.active.to_a
      Payments::Simulation::Fixtures.provision_locations!(identity: identity, locations: locations)
      # Rehearsals must also work outside the restaurant's real opening hours.
      locations.each { |location| location.update!(hours_json: { 'Daily' => '00:00-23:59' }) }
      SiteSetting.instance.update!(payment_processor: 'worldpay', enable_order_emails: false,
        enable_order_sms: false, enable_admin_sms: false, enable_storefront_three_squares: true,
        enable_storefront_latte_stone: true, enable_storefront_catering: true, enable_catering_online_ordering: false)
    else
      Rake::Task['payments:simulation:seed'].invoke
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
    end
    metadata['demo_catalog'] = catalog
    # New users bootstrap through the existing ADMIN_EMAILS authenticated path.
    # Existing users keep their Clerk identity and receive the explicit demo role.
    User.where('LOWER(email) = ?', ENV.fetch('DEMO_OWNER_EMAIL').downcase).find_each do |user|
      user.update!(role: 'owner', assigned_location: nil)
    end
    puts "#{catalog} demo catalog and presenter access ready. Email/SMS disabled."
  end
end
