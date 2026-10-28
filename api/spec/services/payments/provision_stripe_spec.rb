require "rails_helper"
require "stringio"
require "rake"

RSpec.describe Payments::ProvisionStripe do
  let(:output) { StringIO.new }
  let(:settings) { create(:site_setting, payment_test_mode: false, payment_processor: "worldpay") }
  let(:account) { Stripe::Account.construct_from(id: "acct_fixture", object: "account") }

  before do
    settings
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("APP_DEPLOYMENT_ENV").and_return("staging")
    allow(ENV).to receive(:[]).with("STRIPE_SECRET_KEY_TEST").and_return("rk_test_fixture_secret")
    allow(ENV).to receive(:[]).with("STRIPE_WEBHOOK_ACCOUNT_ID").and_return("acct_fixture")
    allow(Stripe::Account).to receive(:retrieve).with(nil, { api_key: "rk_test_fixture_secret" }).and_return(account)
  end

  def provision(apply: false)
    described_class.call(apply: apply, output: output)
  end

  it "reads the authenticated account but writes nothing by default and never prints a key" do
    expect { provision }.not_to change { [PaymentIdentity.count, PaymentProfile.count, settings.reload.attributes] }
    expect(Stripe::Account).to have_received(:retrieve).with(nil, { api_key: "rk_test_fixture_secret" })
    expect(output.string).to include("DRY RUN", "sandbox", "acct_fixture", "stripe_default:sandbox:acct_fixture")
    expect(output.string).not_to include("rk_test_fixture_secret")
  end

  it "applies idempotently, reuses immutable identity and default, preserves ordering and POS profiles" do
    pos_identity = PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_pos", profile_key: "pos", credential_reference: "stripe_default")
    pos = PaymentProfile.create!(provider: "stripe", payment_identity: pos_identity, channel: "pos", presentation: "stripe_terminal", enabled: true)
    before_pos = pos.attributes
    settings.update!(online_ordering_paused: true)
    provision(apply: true)
    identity = PaymentIdentity.find_by!(profile_key: "stripe_default:sandbox:acct_fixture")
    expect(identity).to have_attributes(provider: "stripe", environment: "sandbox", external_account_id: "acct_fixture", credential_reference: "stripe_default", currency: "USD")
    profile = PaymentProfile.find_by!(channel: "online", location_id: nil)
    expect(profile).to have_attributes(payment_identity_id: identity.id, provider: "stripe", presentation: "stripe_embedded", enabled: true)
    expect(settings.reload).to have_attributes(payment_processor: "stripe", online_ordering_paused: true)
    expect(pos.reload.attributes).to eq(before_pos)
    original = [identity.attributes, profile.attributes, settings.attributes]
    expect { provision(apply: true) }.not_to change { [PaymentIdentity.count, PaymentProfile.count] }
    expect([identity.reload.attributes, profile.reload.attributes, settings.reload.attributes]).to eq(original)
    expect { identity.update!(environment: "production") }.to raise_error(ActiveRecord::ReadonlyAttributeError)
    profile.update!(enabled: false)
    provision(apply: true)
    expect(profile.reload.enabled).to be true
  end

  it "uses only the production slot with production identity authority" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("production"))
    allow(ENV).to receive(:[]).with("APP_DEPLOYMENT_ENV").and_return("production")
    allow(ENV).to receive(:fetch).with("APP_MODE", "test").and_return("production")
    allow(ENV).to receive(:[]).with("STRIPE_SECRET_KEY").and_return("rk_live_fixture_secret")
    expect(Stripe::Account).to receive(:retrieve).with(nil, { api_key: "rk_live_fixture_secret" }).and_return(account)
    provision(apply: true)
    expect(PaymentIdentity.last.environment).to eq("production")
    expect(PaymentProfile.last.payment_identity_id).to eq(PaymentIdentity.last.id)
  end

  it "refuses absent, unknown and live staging keys before provider traffic" do
    [nil, "unknown", "sk_live_fixture", "rk_live_fixture"].each do |key|
      allow(ENV).to receive(:[]).with("STRIPE_SECRET_KEY_TEST").and_return(key)
      expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    end
    expect(Stripe::Account).not_to have_received(:retrieve)
    expect(PaymentIdentity.count).to eq(0)
  end

  it "refuses a sandbox key in production" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("production"))
    allow(ENV).to receive(:[]).with("APP_DEPLOYMENT_ENV").and_return("production")
    allow(ENV).to receive(:fetch).with("APP_MODE", "test").and_return("production")
    allow(ENV).to receive(:[]).with("STRIPE_SECRET_KEY").and_return("sk_test_fixture")
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration)
    expect(Stripe::Account).not_to have_received(:retrieve)
  end

  it "fails without writes if account verification fails or the webhook account differs" do
    allow(Stripe::Account).to receive(:retrieve).and_raise(Stripe::AuthenticationError.new("fixture"))
    expect { provision(apply: true) }.to raise_error(Stripe::AuthenticationError)
    allow(Stripe::Account).to receive(:retrieve).and_return(Stripe::Account.construct_from(id: "acct_other"))
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration, /webhook account/)
    allow(Stripe::Account).to receive(:retrieve).and_return(Stripe::Account.construct_from(id: "invalid"))
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration, /invalid account/)
    expect(PaymentIdentity.count).to eq(0)
    expect(settings.reload.payment_processor).to eq("worldpay")
  end

  it "refuses conflicting online profiles without rerouting them or changing settings" do
    identity = PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_other", profile_key: "other", credential_reference: "stripe_default")
    profile = PaymentProfile.create!(provider: "stripe", payment_identity: identity, channel: "online", presentation: "stripe_embedded", enabled: true)
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration, /Conflicting/)
    expect(PaymentIdentity.count).to eq(1)
    expect(profile.reload.payment_identity_id).to eq(identity.id)
    expect(settings.reload.payment_processor).to eq("worldpay")
  end

  it "refuses an immutable profile-key collision without overwriting it" do
    identity = PaymentIdentity.create!(provider: "stripe", environment: "sandbox", external_account_id: "acct_other", profile_key: "stripe_default:sandbox:acct_fixture", credential_reference: "stripe_default")
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration, /identity conflicts/)
    expect(identity.reload.external_account_id).to eq("acct_other")
  end

  it "requires an initialized settings row and refuses other Rails environments" do
    SiteSetting.delete_all
    expect { provision(apply: true) }.to raise_error(Payments::Configuration::UnsafeConfiguration, /Initialize site settings/)
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("test"))
    expect { provision }.to raise_error(Payments::Configuration::UnsafeConfiguration, /Rails staging or production/)
  end

  it "rolls back identity and profile when the settings write fails" do
    allow(SiteSetting).to receive(:first).and_return(settings)
    allow(settings).to receive(:update!).and_raise(ActiveRecord::RecordInvalid.new(settings))
    expect { provision(apply: true) }.to raise_error(ActiveRecord::RecordInvalid)
    expect(PaymentIdentity.count).to eq(0)
    expect(PaymentProfile.count).to eq(0)
  end

  it "writes from the task only for the exact APPLY=true opt-in" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("payments:provision_stripe")
    task = Rake::Task["payments:provision_stripe"]
    [nil, "false", "TRUE", "true"].each do |value|
      allow(ENV).to receive(:[]).with("APPLY").and_return(value)
      expect(described_class).to receive(:call).with(apply: value == "true")
      task.reenable
      task.invoke
    end
  end
end
