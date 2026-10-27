require 'spec_helper'
require 'active_support/all'
require 'active_support/testing/time_helpers'
require_relative '../../../../app/services/payments/worldpay/configuration'
require_relative '../../../../app/services/payments/worldpay/return_state'

RSpec.describe Payments::Worldpay::ReturnState do
  include ActiveSupport::Testing::TimeHelpers
  let(:verifier) { ActiveSupport::MessageVerifier.new('local-return-fixture-' * 4, serializer: JSON) }
  let(:state) { described_class.new(verifier: verifier) }
  let(:attempt) { Struct.new(:id, :checkout_session_id, :payment_identity_id, :payload_digest, :requested_cents, :currency).new('attempt-a', 'session-a', 'identity-a', 'snapshot-a', 1250, 'USD') }
  let(:key) { 'cfe7716e-116e-4ec8-8c53-5f4b3c1d1315' }

  it 'binds the return to the original attempt, identity, snapshot, amount and operation' do
    token = state.issue(attempt: attempt, operation_key: key)
    expect(state.valid?(token, attempt: attempt, operation_key: key)).to be(true)
    attempt.members.each do |field|
      changed = attempt.dup
      changed[field] = field == :requested_cents ? 1300 : 'different'
      expect(state.valid?(token, attempt: changed, operation_key: key)).to be(false)
    end
    expect(state.valid?(token, attempt: attempt, operation_key: 'cfe7716e-116e-4ec8-8c53-5f4b3c1d1316')).to be(false)
    expect(state.valid?(token + 'altered', attempt: attempt, operation_key: key)).to be(false)
  end

  it 'rejects stale, oversized and unscoped return hints' do
    token = state.issue(attempt: attempt, operation_key: key)
    travel 16.minutes do
      expect(state.valid?(token, attempt: attempt, operation_key: key)).to be(false)
    end
    expect(state.valid?('x' * 4097, attempt: attempt, operation_key: key)).to be(false)
    unscoped = verifier.generate({ 'attempt' => attempt.id })
    expect(state.valid?(unscoped, attempt: attempt, operation_key: key)).to be(false)
  end
end
