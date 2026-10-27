module Payments
  module Simulation
    class Guard
      def self.validate!(identity)
        Configuration.validate_identity!(identity)
        unless !Configuration.production? && ENV['PAYMENTS_SIMULATION_ENABLED'] == 'true' && identity.environment == 'simulated'
          raise Configuration::UnsafeConfiguration, 'Simulation is disabled in this environment'
        end
        # Never use live catalog/stock as simulator fixtures. The explicit opt-in
        # requires a dedicated database, shared development DBs are forbidden.
        name = ActiveRecord::Base.connection_db_config.database.to_s
        raise Configuration::UnsafeConfiguration, 'Shared development/test databases cannot simulate' if %w[three_squares_development three_squares_test].include?(name)
        unless name.match?(/\A(?:tsq_.*(?:sim|p4a)|three_squares_ci_)/) || Rails.env.test?
          raise Configuration::UnsafeConfiguration, 'Simulation requires a dedicated fixture database'
        end
        identity
      end
    end
  end
end
