# frozen_string_literal: true
require_relative 'demo_database'

module DemoConfiguration
  def self.apply!(config, environment:, env: ENV)
    return unless environment.to_s == 'development' && env['DEMO_QUEUE'] == '1'

    require 'uri'
    database = URI.parse(env.fetch('DATABASE_URL')).path.delete_prefix('/')
    unless DemoDatabase.valid_name?(database) && env['APP_DEPLOYMENT_ENV'] == 'development' &&
        env['APP_MODE'] == 'test' && env['PAYMENTS_SIMULATION_ENABLED'] == 'true' &&
        env['WORLDPAY_MODE'] == 'simulated' && env['WORLDPAY_TRANSPORT_ENABLED'] == 'false' &&
        env['WORLDPAY_TRIPOS_TRANSPORT_ENABLED'] == 'false'
      raise 'DEMO_QUEUE requires a dedicated demo database and simulated development configuration'
    end

    config.active_job.queue_adapter = :solid_queue
    config.active_storage.service = :local
    config.action_mailer.perform_deliveries = false
    env['SOLID_QUEUE_RECURRING_SCHEDULE'] = File.expand_path('../config/demo_recurring.yml', __dir__)
  end
end
