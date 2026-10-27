import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppConfigCache } from '../src/lib/appConfigCache.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('coalesces subscribers and survives a StrictMode unsubscribe/resubscribe', async () => {
  const pending = deferred();
  let calls = 0;
  const cache = createAppConfigCache(() => { calls += 1; return pending.promise; });
  const firstUnmount = cache.subscribe(() => {});
  firstUnmount();
  let updates = 0;
  const unmount = cache.subscribe(() => { updates += 1; });
  const secondUnmount = cache.subscribe(() => {});
  await flush();
  assert.equal(calls, 1);
  pending.resolve({ banner: 'fresh' });
  await flush();
  assert.deepEqual(cache.getSnapshot(), { banner: 'fresh' });
  assert.equal(updates, 1);
  unmount();
  secondUnmount();
});

test('refreshes mounted consumers at TTL without navigation and stops after unmount', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const cache = createAppConfigCache(async () => ({ revision: ++calls }));
  const unmount = cache.subscribe(() => {});
  await flush();
  t.mock.timers.tick(120_000);
  await flush();
  assert.deepEqual(cache.getSnapshot(), { revision: 2 });
  unmount();
  t.mock.timers.tick(240_000);
  await flush();
  assert.equal(calls, 2);
});

test('invalidated stale responses cannot overwrite fresh data or clear its in-flight request', async () => {
  const old = deferred();
  const fresh = deferred();
  let calls = 0;
  const cache = createAppConfigCache(() => (++calls === 1 ? old.promise : fresh.promise));
  const unmount = cache.subscribe(() => {});
  await flush();
  cache.invalidate();
  await flush();
  old.resolve({ revision: 'stale' });
  await flush();
  assert.equal(cache.getSnapshot(), null);
  const otherUnmount = cache.subscribe(() => {});
  await flush();
  assert.equal(calls, 2);
  fresh.resolve({ revision: 'fresh' });
  await flush();
  assert.deepEqual(cache.getSnapshot(), { revision: 'fresh' });
  unmount();
  otherUnmount();
});

test('warm mounts share the snapshot and invalidation reaches every consumer', async () => {
  let calls = 0;
  const cache = createAppConfigCache(async () => ({ revision: ++calls }));
  let firstUpdates = 0;
  let secondUpdates = 0;
  const firstUnmount = cache.subscribe(() => { firstUpdates += 1; });
  await flush();
  const secondUnmount = cache.subscribe(() => { secondUpdates += 1; });
  await flush();
  assert.equal(calls, 1);
  cache.invalidate();
  await flush();
  assert.equal(calls, 2);
  assert.equal(firstUpdates, 3);
  assert.equal(secondUpdates, 2);
  firstUnmount();
  secondUnmount();
});

test('a failed refresh retries with a short backoff instead of waiting for the successful TTL', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  const cache = createAppConfigCache(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return { revision: calls };
  });
  const unmount = cache.subscribe(() => {});
  await flush();
  assert.equal(cache.getSnapshot(), null);
  t.mock.timers.tick(1_999);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(cache.getSnapshot(), { revision: 2 });
  unmount();
});

test('ok → transient failure → recovered retains loaded config and resets backoff', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let online = true, calls = 0;
  const cache = createAppConfigCache(async () => { calls++; if (!online) throw Error('offline'); return { online_ordering_paused: false, version: calls }; }, 15_000);
  const unmount = cache.subscribeConnection(() => {});
  await flush();
  assert.equal(cache.getConnectionSnapshot().status, 'available');
  const initial = cache.getSnapshot();
  online = false;
  t.mock.timers.tick(15_000); await flush();
  assert.equal(cache.getConnectionSnapshot().status, 'unavailable');
  assert.equal(cache.getSnapshot(), initial);
  t.mock.timers.tick(2_000); await flush();
  assert.equal(cache.getConnectionSnapshot().failures, 2);
  t.mock.timers.tick(3_999); await flush(); assert.equal(calls, 3);
  online = true;
  t.mock.timers.tick(1); await flush();
  assert.equal(cache.getConnectionSnapshot().status, 'available');
  assert.equal(cache.getConnectionSnapshot().failures, 0);
  assert.equal(cache.getSnapshot().version, 4);
  unmount();
  t.mock.timers.tick(100_000); await flush(); assert.equal(calls, 4);
});

test('never-reached config stays unknown, backs off to a cap and manual retry can recover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let online = false, calls = 0;
  const cache = createAppConfigCache(async () => { calls++; if (!online) throw Error('cold start'); return { online_ordering_paused: true }; });
  const unmount = cache.subscribeConnection(() => {});
  assert.equal(cache.getConnectionSnapshot().status, 'checking');
  await flush();
  assert.equal(cache.getConnectionSnapshot().config, null);
  assert.equal(cache.getConnectionSnapshot().status, 'unavailable');
  for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) { t.mock.timers.tick(delay - 1); await flush(); const before = calls; t.mock.timers.tick(1); await flush(); assert.equal(calls, before + 1); }
  online = true;
  cache.retry(); await flush();
  assert.equal(cache.getConnectionSnapshot().status, 'available');
  assert.equal(cache.getConnectionSnapshot().config.online_ordering_paused, true);
  unmount();
});

test('server pause persists through a failed refresh and unpause only follows successful config', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let state = 'paused';
  const cache = createAppConfigCache(async () => { if (state === 'offline') throw Error('offline'); return { online_ordering_paused: state === 'paused', online_ordering_pause_message: 'Back soon.' }; }, 15_000);
  const unmount = cache.subscribeConnection(() => {});
  await flush(); assert.equal(cache.getSnapshot().online_ordering_paused, true);
  state = 'offline'; cache.retry(); await flush();
  assert.equal(cache.getSnapshot().online_ordering_paused, true);
  assert.equal(cache.getConnectionSnapshot().status, 'unavailable');
  state = 'open'; cache.retry(); await flush();
  assert.equal(cache.getSnapshot().online_ordering_paused, false);
  unmount();
});
