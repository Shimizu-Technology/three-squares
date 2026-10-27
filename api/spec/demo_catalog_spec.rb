require 'rails_helper'
require 'rake'
require 'net/http'
require Rails.root.join('lib/demo_database')

RSpec.describe 'Demo catalog preparation' do
  before(:all) { Rails.application.load_tasks unless Rake::Task.task_defined?('demo:prepare') }

  around do |example|
    original = ENV.to_h
    ENV.update('DEMO_QUEUE' => '1', 'DEMO_CATALOG' => 'three-squares', 'DEMO_OWNER_EMAIL' => 'presenter@example.test',
      'APP_DEPLOYMENT_ENV' => 'development', 'APP_MODE' => 'test', 'PAYMENTS_SIMULATION_ENABLED' => 'true')
    example.run
  ensure
    ENV.replace(original)
  end

  before do
    # Execute actual seeds in this suite's disposable transactional DB. The
    # production/development branch gate has separate configuration coverage.
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('development'))
    database = ActiveRecord::Base.connection_db_config.database
    allow(DemoDatabase).to receive(:valid_name?).and_call_original
    allow(DemoDatabase).to receive(:valid_name?).with(database).and_return(true)
    # Keep the suite's established test connection: db:seed prerequisites would
    # reconnect using the stubbed development environment. Execute the real seed.
    allow(Rake::Task['db:seed']).to receive(:invoke) { Rails.application.load_seed }
    ActiveRecord::Base.connection_pool.internal_metadata['demo_catalog'] = nil
    allow_any_instance_of(Net::HTTP).to receive(:request).and_raise('External HTTP forbidden while seeding')
  end

  def prepare
    %w[demo:prepare db:seed payments:simulation:seed].each { |name| Rake::Task[name].reenable }
    Rake::Task['demo:prepare'].invoke
  end

  it 'loads the existing public menu locally, then configures simulation at every active seeded location without HTTP' do
    SiteSetting.instance.update!(payment_processor: 'stripe', enable_order_emails: true, enable_order_sms: true,
      enable_admin_sms: true, enable_catering_online_ordering: true)
    prepare
    expect(Product.count).to be > 50
    expect(Product.exists?(slug: 'simulation-meal')).to be(false)
    expect(ProductImage.count).to be > 10
    expect(SiteSetting.instance).to have_attributes(payment_processor: 'worldpay', enable_order_emails: false,
      enable_order_sms: false, enable_admin_sms: false, enable_storefront_three_squares: true,
      enable_storefront_latte_stone: true, enable_storefront_catering: true, enable_catering_online_ordering: false)
    identity = PaymentIdentity.find_by!(profile_key: 'local-simulator')
    Location.active.each do |location|
      expect(PaymentProfile.where(payment_identity: identity, location: location, enabled: true).pluck(:channel)).to match_array(%w[online pos])
      terminal = PaymentTerminal.find_by!(payment_identity: identity, location: location)
      expect(terminal).to have_attributes(connection_state: 'connected', payment_profile: PaymentProfile.find_by!(payment_identity: identity, location: location, channel: 'pos'))
      expect(location.accepting_orders_at?(Time.utc(2026, 10, 27, 17))).to be(true)
    end
    burger = Product.find_by!(slug: 'cheeseburger')
    expect(burger.product_locations.available.joins(:location).pluck('locations.slug')).to eq(['three-squares-main'])
    snapshot = [Product.count, ProductImage.count, PaymentProfile.count, PaymentTerminal.count, ProductCollection.count]
    oid = ActiveRecord::Base.connection.select_value("SELECT pg_relation_filenode('solid_queue_jobs')")
    prepare
    expect([Product.count, ProductImage.count, PaymentProfile.count, PaymentTerminal.count, ProductCollection.count]).to eq(snapshot)
    expect(ActiveRecord::Base.connection.select_value("SELECT pg_relation_filenode('solid_queue_jobs')")).to eq(oid)
  end

  it 'retains the four-product fictional option without loading the restaurant seed' do
    ENV['DEMO_CATALOG'] = 'fictional'
    prepare
    expect(Product.pluck(:slug)).to match_array(%w[simulation-meal demo-grilled-chicken demo-roasted-vegetables demo-citrus-tea])
    expect(Location.pluck(:slug)).to match_array(%w[simulation-north simulation-south])
    expect(PaymentTerminal.count).to eq(2)
    expect(Product.exists?(slug: 'cheeseburger')).to be(false)
  end

  it 'requires an explicit reset to switch catalogs rather than mixing records' do
    ENV['DEMO_CATALOG'] = 'fictional'
    prepare
    ENV['DEMO_CATALOG'] = 'three-squares'
    expect { prepare }.to raise_error(SystemExit)
    expect(Product.exists?(slug: 'cheeseburger')).to be(false)
  end
end
