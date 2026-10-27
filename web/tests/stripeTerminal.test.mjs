import assert from 'node:assert/strict';
import test from 'node:test';

let fixtureId = 0;
async function fixture() {
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
