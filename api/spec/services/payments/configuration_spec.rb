require "rails_helper"

RSpec.describe Payments::Configuration do
  let(:unsafe) { described_class::UnsafeConfiguration }

  before do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
    env("APP_DEPLOYMENT_ENV", "staging")
    env("APP_MODE", "test")
  end

  around do |example|
    names = (ENV.keys.grep(/\ASTRIPE_/) + %w[STRIPE_ALTERNATE_SLOT STRIPE_SECRET_KEY STRIPE_SECRET_KEY_TEST STRIPE_PUBLISHABLE_KEY STRIPE_PUBLISHABLE_KEY_TEST APP_DEPLOYMENT_ENV APP_MODE PAYMENTS_SIMULATION_ENABLED WORLDPAY_MODE]).uniq
    saved = ENV.to_h.slice(*names)
    names.each { |name| ENV.delete(name) }
    example.run
  ensure
    names.each { |name| ENV.delete(name) }
    saved.each { |name, value| ENV[name] = value }
  end

  def env(key, value)
    value.nil? ? ENV.delete(key) : ENV[key] = value
  end

  def identity(environment)
    PaymentIdentity.new(provider: "stripe", environment: environment, external_account_id: "acct_fixture", profile_key: "fixture", credential_reference: "stripe_default")
  end

  it "accepts explicit staging with test or restricted test keys and never calls it production" do
    %w[sk_test_fixture rk_test_fixture].each do |key|
      env("STRIPE_SECRET_KEY_TEST", key)
      expect { described_class.validate_database! }.not_to raise_error
      expect(described_class.production?).to be false
      expect(described_class.validate_identity!(identity("sandbox")).environment).to eq("sandbox")
    end
  end

  [nil, "", "development", "test", "production", "unknown"].each do |deployment|
    it "refuses staging deployment #{deployment.inspect} without becoming production" do
      env("APP_DEPLOYMENT_ENV", deployment)
      expect(described_class.production?).to be false
      expect { described_class.validate_environment! }.to raise_error(unsafe, "Staging requires APP_DEPLOYMENT_ENV=staging")
    end
  end

  %w[STRIPE_SECRET_KEY STRIPE_SECRET_KEY_TEST STRIPE_PUBLISHABLE_KEY STRIPE_PUBLISHABLE_KEY_TEST STRIPE_ALTERNATE_SLOT].product(%w[sk_live_fixture rk_live_fixture pk_live_fixture]).each do |slot, key|
    it "refuses #{key.split('_').first} live credentials in #{slot}" do
      env(slot, key)
      expect { described_class.validate_environment! }.to raise_error(unsafe, "Staging cannot use live Stripe credentials")
    end
  end

  it "refuses production identities outside production" do
    expect { described_class.validate_identity!(identity("production")) }.to raise_error(unsafe, "Production payments are disabled outside production")
  end

  it "requires sandbox enabled profiles at validation and boot, including bypassed writes" do
    %w[simulated production].each do |environment|
      row = PaymentIdentity.create!(identity(environment).attributes.except("id").merge(profile_key: environment))
      profile = PaymentProfile.create!(provider: "stripe", channel: "online", presentation: "stripe_embedded", payment_identity: row, enabled: false)
      profile.enabled = true
      expect(profile).not_to be_valid
      profile.update_columns(enabled: true)
      expect { described_class.validate_database! }.to raise_error(unsafe, "Staging requires sandbox enabled payment profiles")
      profile.update_columns(enabled: false)
    end
  end

  it "preserves the simulation opt-in without allowing it to bypass profile safety" do
    env("PAYMENTS_SIMULATION_ENABLED", "true")
    expect { described_class.validate_environment! }.not_to raise_error
    env("PAYMENTS_SIMULATION_ENABLED", nil)
    expect { Payments::Simulation::Guard.validate!(identity("simulated")) }.to raise_error(unsafe, "Simulation is disabled in this environment")
  end

  context "production regression contract" do
    before do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("production"))
      env("APP_DEPLOYMENT_ENV", "production")
      env("APP_MODE", "production")
    end

    it "accepts live keys, restricted live keys and absent Stripe just as before" do
      [nil, "sk_live_fixture", "rk_live_fixture"].each do |key|
        env("STRIPE_SECRET_KEY", key)
        expect { described_class.validate_environment! }.not_to raise_error
      end
      expect(described_class.production?).to be true
      expect { described_class.validate_identity!(identity("production")) }.not_to raise_error
      expect { described_class.validate_identity!(identity("sandbox")) }.to raise_error(unsafe)
    end

    it "still requires the production deployment label" do
      env("APP_DEPLOYMENT_ENV", "staging")
      expect { described_class.validate_environment! }.to raise_error(unsafe, "Production requires APP_DEPLOYMENT_ENV=production")
    end

    it "still rejects legacy modes, simulation and non-live primary keys" do
      { "APP_MODE" => "test", "PAYMENTS_SIMULATION_ENABLED" => "true", "WORLDPAY_MODE" => "sandbox", "STRIPE_SECRET_KEY" => "rk_test_fixture" }.each do |name, value|
        env(name, value)
        expect { described_class.validate_environment! }.to raise_error(unsafe)
        env(name, name == "APP_MODE" ? "production" : nil)
      end
    end

    it "still checks legacy database test mode and enabled profile authority" do
      settings = create(:site_setting, payment_test_mode: false)
      settings.update_columns(payment_test_mode: true)
      expect { described_class.validate_database! }.to raise_error(unsafe, "Disable legacy payment_test_mode before production boot")
      settings.update_columns(payment_test_mode: false)
      row = PaymentIdentity.create!(identity("sandbox").attributes.except("id"))
      profile = PaymentProfile.create!(payment_identity: row, provider: "stripe", channel: "online", presentation: "stripe_embedded", enabled: false)
      profile.update_columns(enabled: true)
      expect { described_class.validate_database! }.to raise_error(unsafe, "Production has an enabled nonproduction payment profile")
    end

    it "retains the deployment production guard outside Rails production" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("development"))
      expect(described_class.production?).to be true
      env("APP_MODE", "test")
      expect { described_class.validate_environment! }.to raise_error(unsafe)
    end
  end
end
