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

test('a failed refresh retries on the next TTL instead of spinning or freezing', async (t) => {
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
  t.mock.timers.tick(119_999);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(cache.getSnapshot(), { revision: 2 });
  unmount();
});
