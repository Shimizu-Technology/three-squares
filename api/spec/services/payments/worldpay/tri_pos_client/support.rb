# frozen_string_literal: true

require "rspec/core"
require "rspec/expectations"
require "rspec/mocks"
require "net/http"
require_relative "../../../../../app/services/payments/worldpay/tri_pos_client"
require_relative "../../../../../app/services/payments/worldpay/tri_pos_transport"

# Synthetic identifiers only. No Rails, database, real transport, ENV credentials,
# captured processor traffic, merchant information, or device calls.
module TriPosClientSupport
  Identity = Struct.new(:id, :provider, :environment, :external_account_id, :external_acceptor_id, :credential_reference, keyword_init: true)

  def identity(**overrides)
    Identity.new(**{ id: 1, provider: "worldpay", environment: "sandbox", external_account_id: "synthetic-account",
      external_acceptor_id: "synthetic-acceptor", credential_reference: "worldpay_default" }.merge(overrides))
  end

  def config_env
    { "APP_DEPLOYMENT_ENV" => "test", "WORLDPAY_MODE" => "sandbox", "WORLDPAY_TRIPOS_ORIGIN" => "https://triposcert.vantiv.com",
      "WORLDPAY_EXPRESS_ACCOUNT_ID" => "synthetic-account", "WORLDPAY_EXPRESS_ACCEPTOR_ID" => "synthetic-acceptor",
      "WORLDPAY_EXPRESS_ACCOUNT_TOKEN" => "synthetic-secret-token", "WORLDPAY_EXPRESS_APPLICATION_ID" => "synthetic-app",
      "WORLDPAY_EXPRESS_APPLICATION_NAME" => "Synthetic Application", "WORLDPAY_EXPRESS_APPLICATION_VERSION" => "synthetic-release" }
  end

  def configuration(**options)
    Payments::Worldpay::TriPosConfiguration.new(**{ identity: identity, env: config_env }.merge(options))
  end

  def sale_data(**options)
    { "_hasErrors" => false, "_errors" => [], "_processor" => { "expressResponseCode" => "0", "hostResponseCode" => "00" },
      "transactionId" => "synthetic-transaction", "terminalId" => "synthetic-terminal", "currencyCode" => "USD",
      "approvedAmount" => Payments::Worldpay::Money::DecimalLexeme.new("0.29"),
      "totalAmount" => Payments::Worldpay::Money::DecimalLexeme.new("0.29"), "isApproved" => true,
      "isOffline" => false, "transactionStored" => false }.merge(options.transform_keys(&:to_s))
  end

  def report_row(**options)
    { "AccountId" => { "Value" => "synthetic-account" }, "accountId" => "synthetic-account", "acceptorId" => "synthetic-acceptor",
      "transactionId" => "synthetic-transaction", "referenceNumber" => "synthetic-reference", "terminalId" => "synthetic-terminal",
      "transactionAmount" => Payments::Worldpay::Money::DecimalLexeme.new("0.29"),
      "approvedAmount" => Payments::Worldpay::Money::DecimalLexeme.new("0.29"),
      "transactionStatus" => "SyntheticVendorState", "transactionStatusCode" => "XX", "transactionType" => "SyntheticType",
      "expressResponseCode" => "XX", "HostResponseCode" => "00" }.merge(options.transform_keys(&:to_s))
  end

  def query_wire(rows)
    JSON.generate("_hasErrors" => false, "_errors" => [], "reportingData" => rows)
  end

  def parse(data = sale_data, operation: :sale)
    Payments::Worldpay::TriPosResponseParser.call(JSON.generate(data), operation: operation)
  end

  class MemoryTransport
    attr_reader :requests
    attr_accessor :status, :wire, :echo, :response_headers, :exception

    def initialize(wire)
      @wire, @requests, @status, @echo, @response_headers = wire, [], 200, true, {}
    end

    def call(**request)
      @requests << request
      raise @exception if @exception
      headers = @response_headers.dup
      headers["TP-Request-ID"] = request[:headers]["tp-request-id"] if @echo
      { status: @status, headers: headers, body: @wire }
    end

    def inspect = "#<MemoryTransport [REDACTED]>"
  end
end

RSpec.configure do |config|
  config.include TriPosClientSupport, tripos_client: true
  config.before(tripos_client: true) do
    # A real socket is always a test failure; do not test opt-in provider I/O.
    allow(Net::HTTP).to receive(:new).and_raise("network forbidden")
    allow(TCPSocket).to receive(:new).and_raise("network forbidden")
  end
end
