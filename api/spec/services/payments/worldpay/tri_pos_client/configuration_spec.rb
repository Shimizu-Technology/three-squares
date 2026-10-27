# frozen_string_literal: true

require_relative "support"

RSpec.describe Payments::Worldpay::TriPosConfiguration do
  it "binds the fixed certification origin and original account/acceptor" do
    config = configuration
    expect(config.endpoint).to eq("https://triposcert.vantiv.com")
    expect(config.identity_id).to eq(1)
    expect(config.environment).to eq("sandbox")
    expect(config).to be_frozen
  end

  it "uses the fixed production origin only with explicit production deployment/mode" do
    env = config_env.merge("APP_DEPLOYMENT_ENV" => "production", "APP_MODE" => "production", "WORLDPAY_MODE" => "production",
      "WORLDPAY_TRIPOS_ORIGIN" => "https://tripos.vantiv.com")
    expect(configuration(identity: identity(environment: "production"), env: env).endpoint).to eq("https://tripos.vantiv.com")
    expect { configuration(env: config_env.merge("APP_DEPLOYMENT_ENV" => "production")) }.to raise_error(described_class::Invalid)
    expect { configuration(identity: identity(environment: "production"), env: env.merge("APP_MODE" => "staging")) }.to raise_error(described_class::Invalid)
  end

  [ { provider: "stripe" }, { environment: "simulated" }, { environment: "unexpected" },
    { credential_reference: "secret://arbitrary" }, { external_account_id: "other" }, { external_acceptor_id: "other" },
    { external_account_id: " synthetic-account" }, { id: nil } ].each do |changes|
    it "rejects identity mismatch #{changes.keys.join(',')} without exposing values" do
      expect { configuration(identity: identity(**changes)) }.to raise_error(described_class::Invalid) do |error|
        expect(error.message).not_to include("synthetic", "secret://")
        expect(error.cause).to be_nil
      end
    end
  end

  [ "http://triposcert.vantiv.com", "https://tripos.vantiv.com", "https://triposcert.vantiv.com.attacker.test",
    "https://synthetic-secret-token@triposcert.vantiv.com", "https://triposcert.vantiv.com:444", "https://triposcert.vantiv.com/api/v1",
    "https://triposcert.vantiv.com?next=evil", "https://triposcert.vantiv.com/#fragment" ].each do |origin|
    it "rejects arbitrary or noncanonical origin #{origin.split('/').last}" do
      expect { configuration(env: config_env.merge("WORLDPAY_TRIPOS_ORIGIN" => origin)) }.to raise_error(described_class::Invalid)
    end
  end

  it "rejects missing, injected, simulation, or cross-mode credentials" do
    described_class::HEADER_ENV.each_value do |key|
      [ nil, "", " padded ", "value\r\nInjected: secret", "x" * 257 ].each do |bad|
        expect { configuration(env: config_env.merge(key => bad)) }.to raise_error(described_class::Invalid)
      end
    end
    expect { configuration(env: config_env.merge("WORLDPAY_MODE" => "production")) }.to raise_error(described_class::Invalid)
    expect { configuration(env: config_env.merge("PAYMENTS_SIMULATION_ENABLED" => "true")) }.to raise_error(described_class::Invalid)
  end

  it "produces immutable JSON headers with Version=2.0 only on Transaction" do
    id = "12345678-1234-1234-1234-123456789abc".dup
    headers = configuration.headers(request_id: id)
    expect(headers).to include("tp-authorization" => "Version=2.0", "Accept" => "application/json", "Content-Type" => "application/json", "tp-request-id" => id)
    described_class::HEADER_ENV.each { |header, name| expect(headers[header]).to eq(config_env[name]) }
    expect(configuration.headers(request_id: id, lane_api: true)).not_to have_key("tp-authorization")
    expect(headers).to be_frozen
    expect { headers["tp-express-account-token"].replace("changed") }.to raise_error(FrozenError)
    id.replace("changed")
    expect(headers["tp-request-id"]).not_to eq(id)
    expect { configuration.headers(request_id: "invalid\nheader") }.to raise_error(described_class::Invalid)
  end

  it "snapshots configuration and redacts inspection/string interpolation" do
    env = config_env.transform_values(&:dup)
    source_identity = identity(external_account_id: "synthetic-account".dup)
    config = configuration(identity: source_identity, env: env)
    source_identity.external_account_id.replace("changed")
    env["WORLDPAY_EXPRESS_ACCOUNT_TOKEN"].replace("changed")
    expect(config.headers(request_id: SecureRandom.uuid)["tp-express-account-token"]).to eq("synthetic-secret-token")
    expect(config.inspect).to include("REDACTED")
    expect("#{config}").not_to include("synthetic", "changed")
  end
end
