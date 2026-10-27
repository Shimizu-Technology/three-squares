module PaymentFoundationHelpers
  class Provider
    def initialize(identity)
      @identity = identity
    end

    def setup(attempt:)
      { raw_id: "pi_#{attempt.id.delete('-')}", flow: attempt.collection_mode == 'terminal' ? 'stripe_terminal' : 'stripe_embedded', client_secret: 'fixture_client_secret' }
    end

    def query(attempt:)
      state = attempt.reload.provider_metadata.fetch('fixture_status', 'captured')
      captured = state == 'captured' ? attempt.requested_cents : 0
      Payments::Result.new(status: state, identity_id: @identity.id,
        raw_id: attempt.raw_provider_id || "pi_#{attempt.id.delete('-')}", requested_cents: attempt.requested_cents,
        approved_cents: captured, captured_cents: captured, currency: attempt.currency, metadata: {})
    end

    def reverse(attempt:, operation_key:)
      { raw_id: "re_#{operation_key.delete('-')}", status: 'succeeded', amount_cents: attempt.captured_cents }
    end

    def validate_binding!(*); true; end
  end

  def configure_payment_fixture!
    SiteSetting.instance.update!(payment_processor: 'stripe')
    @payment_identity = PaymentIdentity.create!(provider: 'stripe', environment: 'sandbox', external_account_id: 'acct_fixture', profile_key: SecureRandom.uuid, credential_reference: 'stripe_default')
    %w[online pos].each do |channel|
      PaymentProfile.create!(provider: 'stripe', payment_identity: @payment_identity, channel: channel, presentation: channel == 'online' ? 'stripe_embedded' : 'stripe_terminal', enabled: true)
    end
    allow(Payments::ProviderResolver).to receive(:for_identity) { |identity| Provider.new(identity) }
    allow(Payments::ProviderResolver).to receive(:for_attempt) { |attempt| Provider.new(attempt.payment_identity) }
    @capability = SecureRandom.hex(32)
    @request_key = SecureRandom.uuid
  end

  def payment_headers(session_id = nil)
    { 'X-Checkout-Capability' => @capability, 'Idempotency-Key' => @request_key }.tap { |h| h['X-Session-ID'] = session_id if session_id }
  end
end
