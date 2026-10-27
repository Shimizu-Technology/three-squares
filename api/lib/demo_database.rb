# frozen_string_literal: true

# Shared by the launcher and the opt-in development fixtures; no Rails dependency.
module DemoDatabase
  def self.valid_name?(name)
    name.to_s.match?(/\A(?:three_squares_demo|tsq_[a-z0-9_]*(?:demo|sim)[a-z0-9_]*)\z/) &&
      name.bytesize <= 63 && !name.match?(/prod|live|development|test/i)
  end
end
