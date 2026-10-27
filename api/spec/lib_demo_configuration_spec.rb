require 'spec_helper'
require 'ostruct'
require 'yaml'
require_relative '../lib/demo_configuration'

RSpec.describe DemoConfiguration do
  let(:config) { OpenStruct.new(active_job: OpenStruct.new, active_storage: OpenStruct.new, action_mailer: OpenStruct.new) }
  let(:env) do
    { 'DEMO_QUEUE' => '1', 'DATABASE_URL' => 'postgresql://localhost/three_squares_demo',
      'APP_DEPLOYMENT_ENV' => 'development', 'APP_MODE' => 'test', 'PAYMENTS_SIMULATION_ENABLED' => 'true',
      'WORLDPAY_MODE' => 'simulated', 'WORLDPAY_TRANSPORT_ENABLED' => 'false', 'WORLDPAY_TRIPOS_TRANSPORT_ENABLED' => 'false' }
  end

  it 'leaves production config and environment untouched even when the demo flag is set' do
    before = Marshal.dump(config)
    original_env = env.dup
    described_class.apply!(config, environment: 'production', env: env)
    expect(Marshal.dump(config)).to eq(before)
    expect(env).to eq(original_env)
    production = File.read(File.expand_path('../config/environments/production.rb', __dir__))
    expect(production).to include("raise 'Production requires QUEUE_DATABASE_URL'", 'writing: :queue')
  end

  it 'leaves ordinary development unchanged without opt-in' do
    env.delete('DEMO_QUEUE')
    described_class.apply!(config, environment: 'development', env: env)
    expect(config.active_job.queue_adapter).to be_nil
    expect(env).not_to have_key('SOLID_QUEUE_RECURRING_SCHEDULE')
  end

  it 'enables same-database queue and local-only storage/sends for an explicit demo' do
    described_class.apply!(config, environment: 'development', env: env)
    expect(config.active_job.queue_adapter).to eq(:solid_queue)
    expect(config.active_storage.service).to eq(:local)
    expect(config.action_mailer.perform_deliveries).to be(false)
    expect(config.respond_to?(:solid_queue)).to be(false)
    schedule = YAML.load_file(env.fetch('SOLID_QUEUE_RECURRING_SCHEDULE')).fetch('development')
    expect(schedule.keys).to match_array(%w[recover_payments dispatch_payment_outbox recover_refunds])
    expect(schedule.values.map { |task| task['schedule'] }.uniq).to eq(['every minute'])
  end

  it 'rejects shared and production-looking database names before changing config' do
    %w[three_squares_development three_squares_test postgres tsq_demo_prod tsq_live_sim tsq_demo_test].each do |name|
      env['DATABASE_URL'] = "postgresql://localhost/#{name}"
      expect { described_class.apply!(config, environment: 'development', env: env) }.to raise_error(/dedicated demo/)
      expect(config.active_job.queue_adapter).to be_nil
    end
  end
end
