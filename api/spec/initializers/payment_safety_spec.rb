require "rails_helper"
require "rake"

RSpec.describe "Payment boot safety" do
  let(:configuration) { Payments::Configuration }
  let(:initializer) { Rails.root.join("config/initializers/payment_safety.rb") }
  let(:callback) do
    path = initializer
    captured = nil
    config = double("initializer config")
    allow(config).to receive(:after_initialize) { |&block| captured = block }
    allow(Rails).to receive(:application).and_return(double(config: config))
    load path
    captured
  end

  before do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
    allow(Rake.application).to receive(:top_level_tasks).and_return(["db:prepare"])
    allow(configuration).to receive(:validate_database!).and_raise(ActiveRecord::NoDatabaseError)
  end

  it "allows a missing primary only for staging creation/prepare tasks" do
    %w[db:prepare db:create db:create:primary db:create:queue db:create:cable].each do |task|
      allow(Rake.application).to receive(:top_level_tasks).and_return([task])
      expect { callback.call }.not_to raise_error
    end
  end

  it "never ignores a missing database on a normal boot, runner, or mixed command" do
    [[], ["db:migrate"], ["runner"], ["db:prepare", "runner"]].each do |tasks|
      allow(Rake.application).to receive(:top_level_tasks).and_return(tasks)
      expect { callback.call }.to raise_error(ActiveRecord::NoDatabaseError)
    end
  end

  it "never bypasses production or any unsafe environment/profile error" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("production"))
    expect { callback.call }.to raise_error(ActiveRecord::NoDatabaseError)
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
    allow(configuration).to receive(:validate_database!).and_raise(configuration::UnsafeConfiguration, "unsafe fixture")
    expect { callback.call }.to raise_error(configuration::UnsafeConfiguration, "unsafe fixture")
  end
end
