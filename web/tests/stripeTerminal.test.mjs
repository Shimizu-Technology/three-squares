import assert from 'node:assert/strict';
import test from 'node:test';

let fixtureId = 0;
async function fixture(overrides = {}) {
  const service = await import(`../src/services/stripeTerminal.ts?fixture=${++fixtureId}`);
  let callbacks;
  let clear = async () => ({});
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    requests.push(options.headers['X-Location-ID']);
    return { ok: true, json: async () => ({ secret: 'fixture_only' }) };
  };
  service.setTokenProvider(async () => 'fixture_token');
  await service.setTerminalLocation(1);
  await service.initializeTerminal(async () => ({ create(options) {
    callbacks = options;
    return {
      discoverReaders: async () => { await callbacks.onFetchConnectionToken(); return { discoveredReaders: [] }; },
      clearCachedCredentials: () => clear(), cancelCollectPaymentMethod: async () => ({}), disconnectReader: async () => ({}),
      connectReader: async reader => ({ reader }), ...overrides,
    };
  } }));
  return { service, requests, setClear: value => { clear = value; }, cleanup() { service.destroyTerminal(); globalThis.fetch = originalFetch; } };
}

test('a failed account reset cannot reuse previous account credentials and can be retried', async () => {
  const f = await fixture();
  try {
    await f.service.discoverReaders();
    f.setClear(async () => ({ error: { message: 'fixture reset failed' } }));
    await assert.rejects(f.service.setTerminalLocation(2), /reset failed/);
    await assert.rejects(f.service.discoverReaders(), /Select a POS location/);
    assert.deepEqual(f.requests, ['1']);
    f.setClear(async () => ({}));
    await f.service.setTerminalLocation(2);
    await f.service.discoverReaders();
    assert.deepEqual(f.requests, ['1', '2']);
  } finally { f.cleanup(); }
});

test('a delayed reset and overlapping location change finish on the newly selected account', async () => {
  const f = await fixture();
  try {
    let release;
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    f.setClear(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const resetting = f.service.setTerminalLocation(1, { reset: true });
    await entered;
    const changing = f.service.setTerminalLocation(2);
    f.setClear(async () => ({}));
    release({});
    await Promise.all([resetting, changing]);
    await f.service.discoverReaders();
    assert.deepEqual(f.requests, ['2']);
  } finally { f.cleanup(); }
});


test('resume collects the same original PaymentIntent only in its verified collection state', async () => {
  const calls = [];
  const intent = { id: 'pi_fixture', sdk_payment_details: { fixture: true } };
  const f = await fixture({ collectPaymentMethod: async secret => { calls.push(['collect', secret]); return { paymentIntent: intent }; },
    processPayment: async value => { assert.equal(value, intent); calls.push(['process', value.id]); return { paymentIntent: { id: value.id, status: 'succeeded' } }; } });
  try {
    await f.service.connectToReader({ id: 'tmr_fixture' });
    const result = await f.service.resumeStripePayment('pi_fixture_secret', 'requires_payment_method', 'tmr_fixture');
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(calls, [['collect', 'pi_fixture_secret'], ['process', 'pi_fixture']]);
  } finally { f.cleanup(); }
});

test('resume refuses an unverified state, a replacement reader, or lost SDK processing context', async () => {
  let calls = 0;
  const f = await fixture({ collectPaymentMethod: async () => { calls++; }, processPayment: async () => { calls++; } });
  try {
    await f.service.connectToReader({ id: 'tmr_fixture' });
    for (const state of ['', 'unknown', 'processing', 'succeeded', 'canceled', 'requires_capture', 'requires_confirmation']) {
      await assert.rejects(f.service.resumeStripePayment('pi_fixture_secret', state, 'tmr_fixture'), /status check/);
    }
    await assert.rejects(f.service.resumeStripePayment('pi_fixture_secret', 'requires_payment_method', 'tmr_other'), /original registered reader/);
    assert.equal(calls, 0);
  } finally { f.cleanup(); }
});

test('resume retries processing with retained SDK context and never recollects a card', async () => {
  let collected = 0, processed = 0;
  const intent = { id: 'pi_fixture', sdk_payment_details: { fixture: true } };
  const f = await fixture({ collectPaymentMethod: async () => { collected++; return { paymentIntent: intent }; },
    processPayment: async value => { assert.equal(value, intent); processed++; return processed === 1 ? { error: { message: 'fixture response lost', payment_intent: { id: intent.id, status: 'requires_confirmation' } } } : { paymentIntent: { id: intent.id, status: 'succeeded' } }; } });
  try {
    await f.service.connectToReader({ id: 'tmr_fixture' });
    await assert.rejects(f.service.collectPayment('pi_fixture_secret'), /response lost/);
    await f.service.resumeStripePayment('pi_fixture_secret', 'requires_confirmation', 'tmr_fixture');
    assert.equal(collected, 1); assert.equal(processed, 2);
    await assert.rejects(f.service.resumeStripePayment('pi_fixture_secret', 'requires_confirmation', 'tmr_fixture'), /status check/);
  } finally { f.cleanup(); }
});
