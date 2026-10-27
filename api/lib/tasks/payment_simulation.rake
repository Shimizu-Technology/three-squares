namespace :payments do
  namespace :simulation do
    desc 'Create fictional payment/menu/reader fixtures in a dedicated simulator DB'
    task seed: :environment do
      name = ActiveRecord::Base.connection_db_config.database.to_s
      require Rails.root.join('lib/demo_database')
      demo = Rails.env.development? && ENV['DEMO_QUEUE'] == '1' && DemoDatabase.valid_name?(name)
      abort 'Dedicated simulation database and nonproduction simulation opt-in required' unless
        !Payments::Configuration.production? && ENV['PAYMENTS_SIMULATION_ENABLED'] == 'true' && (demo || name.match?(/\Atsq_.*sim/))
      identity = PaymentIdentity.find_or_create_by!(profile_key: 'local-simulator') do |row|
        row.assign_attributes(provider: 'worldpay', environment: 'simulated', external_account_id: 'local-fictional-merchant', credential_reference: 'simulation')
      end
      Payments::Simulation::Guard.validate!(identity)
      SiteSetting.instance.update!(payment_processor: 'worldpay', enable_order_emails: false, enable_order_sms: false, enable_admin_sms: false,
        enable_storefront_three_squares: true, enable_storefront_latte_stone: false)
      product = Product.find_or_create_by!(slug: 'simulation-meal') do |row|
        row.assign_attributes(name: 'Simulation meal', description: 'Fictional simulator fixture', product_type: 'local', published: true,
          base_price_cents: 1250, sku_prefix: 'SIM', allow_pickup: true, allow_shipping: false, inventory_level: 'product', product_stock_quantity: 100)
      end
      %w[north south].each do |label|
        location = Location.find_or_create_by!(slug: "simulation-#{label}") do |row|
          row.assign_attributes(name: "Simulation #{label.capitalize}", active: true, hours_json: {'Daily' => '00:00-23:59'})
        end
        ProductLocation.find_or_create_by!(product: product, location: location)
        %w[online pos].each do |channel|
          PaymentProfile.find_or_create_by!(payment_identity: identity, provider: 'worldpay', channel: channel, location: location) do |row|
            row.assign_attributes(presentation: channel == 'online' ? 'worldpay_hosted_fields' : 'worldpay_terminal', enabled: true)
          end
        end
        pos_profile = PaymentProfile.find_by!(payment_identity: identity, location: location, channel: 'pos')
        PaymentTerminal.find_or_create_by!(payment_identity: identity, lane_id: "sim-#{label}") do |row|
          row.assign_attributes(location: location, payment_profile: pos_profile, connection_state: 'connected', terminal_id: "sim-terminal-#{label}", label: "Simulation reader #{label}")
        end
      end
      puts "Simulated payments — no money moves. Fixtures ready in #{name}. Use the existing development staff sign-in for POS."
    end
  end
end
