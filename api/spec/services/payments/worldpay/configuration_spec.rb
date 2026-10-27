require_relative "client_contract_support"

RSpec.describe Payments::Worldpay::Configuration do
  include_context "offline Worldpay client contracts"

  it "validates immutable identity, fixed secret reference, explicit profiles and exact hosts" do
    config = configuration
    expect(config.environment).to eq("sandbox")
    expect(config.endpoint(:reporting).to_s).to eq(config_env["WORLDPAY_EXPRESS_REPORTING_URL"])
    expect(config.application).to eq(credentials.slice("ApplicationID", "ApplicationName", "ApplicationVersion"))
    expect(config.inspect).not_to include(*credentials.values)
    expect(config).to be_frozen
  end

  [ { provider: "stripe" }, { environment: "simulated" }, { environment: "production" }, { environment: "invalid" },
    { currency: "EUR" }, { credential_reference: "WORLDPAY_EXPRESS_ACCOUNT_TOKEN" }, { external_account_id: "foreign-account" } ].each do |changes|
    it "rejects identity change #{changes.keys.join(',')} before I/O" do
      expect { configuration(identity: identity(**changes)) }.to raise_error(described_class::Invalid)
    end
  end

  it "loads only the six section-7 ENV names from worldpay_default" do
    env = config_env.merge(described_class::CREDENTIAL_ENV.to_h { |field, name| [ name, credentials[field] ] })
    expect(configuration(credentials: nil, env: env).credentials).to eq(credentials.slice("AccountID", "AccountToken", "AcceptorID"))
    expect { configuration(credentials: nil, env: config_env.merge("WORLDPAY_PASSWORD" => "unused-fixture")) }.to raise_error(described_class::Invalid)
  end

  it "rejects missing credentials without echoing values or causes" do
    expect { configuration(credentials: credentials.merge("AccountToken" => "")) }.to raise_error(described_class::Invalid) { |error| expect(error.message).not_to include(*credentials.values) }
  end

  it "requires explicit approval, profile identity, and field values" do
    [ profile.merge(approved: false), profile.merge(key: "other"), profile.merge(fields: {}), profile.merge(fields: { "Terminal" => { "TerminalID" => "" } }) ].each do |value|
      expect { configuration(terminal_profile: value) }.to raise_error(described_class::Invalid)
    end
  end

  [ "http://certtransaction.elementexpress.com/", "https://certtransaction.elementexpress.com.attacker.test/", "https://transaction.elementexpress.com/",
    "https://user:password@certtransaction.elementexpress.com/", "https://certtransaction.elementexpress.com:444/", "https://certtransaction.elementexpress.com/next",
    "https://certtransaction.elementexpress.com/?query=1", "https://certtransaction.elementexpress.com/#fragment" ].each do |url|
    it "rejects endpoint #{url}" do
      expect { configuration(env: config_env.merge("WORLDPAY_EXPRESS_TRANSACTION_URL" => url)) }.to raise_error(described_class::Invalid)
    end
  end

  it "rejects wrong reporting/services hosts and invalid modes/deployments" do
    %w[REPORTING SERVICES].each do |interface|
      expect { configuration(env: config_env.merge("WORLDPAY_EXPRESS_#{interface}_URL" => config_env["WORLDPAY_EXPRESS_TRANSACTION_URL"])) }.to raise_error(described_class::Invalid)
    end
    [ { "APP_DEPLOYMENT_ENV" => "production" }, { "APP_DEPLOYMENT_ENV" => "unknown" }, { "WORLDPAY_MODE" => "simulated" } ].each do |changes|
      expect { configuration(env: config_env.merge(changes)) }.to raise_error(described_class::Invalid)
    end
  end

  it "accepts production only with production deployment, mode, identity and exact hosts" do
    env = config_env.merge("APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => "production", "WORLDPAY_MODE" => "production",
      "WORLDPAY_EXPRESS_HOSTED_BASE_URL" => "https://transaction.hostedpayments.com/")
    described_class::HOSTS["production"].each { |interface, host| env["WORLDPAY_EXPRESS_#{interface.to_s.upcase}_URL"] = "https://#{host}/" }
    expect(configuration(identity: identity(environment: "production"), env: env).environment).to eq("production")
    expect { configuration(identity: identity(environment: "production"), env: env.merge("PAYMENTS_SIMULATION_ENABLED" => "true")) }.to raise_error(described_class::Invalid)
  end

  it "validates return origin and hosted/premium URLs without replacing hosts" do
    expect { configuration(env: config_env.merge("WORLDPAY_RETURN_URL" => "https://checkout.example.test.attacker.test/")) }.to raise_error(described_class::Invalid)
    expect { configuration(env: config_env.merge("WORLDPAY_EXPRESS_HOSTED_BASE_URL" => "https://payments-test.worldpay.com/")) }.to raise_error(described_class::Invalid)
    expect(configuration.hosted_url(WorldpayClientContractSupport::ID)).to eq("https://certtransaction.hostedpayments.com/?TransactionSetupID=#{WorldpayClientContractSupport::ID}")
    expect { configuration.hosted_url("https://payments-test.worldpay.com/123") }.to raise_error(described_class::Invalid)
    expect { configuration.premium_url("https://payments.worldpay.com/123") }.to raise_error(described_class::Invalid)
    expect { configuration.premium_url("http://payments-test.worldpay.com/123") }.to raise_error(described_class::Invalid)
  end
end
