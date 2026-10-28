# frozen_string_literal: true

Rails.application.config.after_initialize do
  Payments::Configuration.validate_database!
rescue ActiveRecord::NoDatabaseError
  # An absent primary cannot contain unsafe profiles. Permit only staging's
  # database-creation tasks to reach Rails' bootstrap; ordinary boots still fail.
  bootstrap_tasks = %w[db:create db:create:primary db:create:queue db:create:cable db:prepare]
  raise unless Rails.env.staging? && defined?(Rake) && Rake.application.top_level_tasks.present? &&
    Rake.application.top_level_tasks.all? { |task| bootstrap_tasks.include?(task) }
end
