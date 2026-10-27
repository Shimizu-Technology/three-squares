import assert from 'node:assert/strict';
import test from 'node:test';

const load = () => import(`../src/services/adminDeviceIdentity.ts?test=${Math.random()}`);

test('keeps a stable persisted device identity and preserves auth headers', async () => {
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, crypto: { randomUUID: () => 'uuid-under-test' } };
  const identity = await load();
  assert.equal(identity.getAdminDeviceId(), 'uuid-under-test');
  assert.equal(identity.getAdminDeviceId(), 'uuid-under-test');
  assert.deepEqual(identity.getAdminDeviceHeaders({ Authorization: 'Bearer token' }), { Authorization: 'Bearer token', 'X-Admin-Device-Id': 'uuid-under-test' });
  delete globalThis.window;
});

test('restricted local storage does not break authenticated requests or change identity per request', async () => {
  globalThis.window = { localStorage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, crypto: { randomUUID: () => 'session-uuid' } };
  const identity = await load();
  assert.equal(identity.getAdminDeviceId(), 'session-uuid');
  assert.equal(identity.getAdminDeviceId(), 'session-uuid');
  delete globalThis.window;
  assert.equal(identity.getAdminDeviceId(), null);
});
