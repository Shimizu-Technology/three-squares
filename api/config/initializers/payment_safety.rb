# frozen_string_literal: true

Rails.application.config.after_initialize do
  Payments::Configuration.validate_database!
end
