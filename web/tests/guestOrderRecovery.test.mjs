import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberOrderCapability, savedGuestOrderIds } from '../src/lib/guestOrderRecovery.ts';

function storage() {
  const data = {};
  Object.defineProperties(data, {
    setItem: { value(key, value) { data[key] = value; } },
    getItem: { value(key) { return data[key] ?? null; } },
    removeItem: { value(key) { delete data[key]; } },
  });
  return data;
}

test('signed-in checkout capabilities do not become guest links after sign-out', () => {
  globalThis.localStorage = storage();
  rememberOrderCapability(11, 'signed-in-capability', false);
  rememberOrderCapability(12, 'guest-capability', true);
  assert.equal(localStorage.getItem('tsq-order-capability:11'), 'signed-in-capability');
  assert.deepEqual(savedGuestOrderIds(), ['12']);
  localStorage.setItem('tsq-order-capability:13', 'legacy-unclassified-capability');
  localStorage.setItem('tsq-guest-order:14', '1');
  assert.deepEqual(savedGuestOrderIds(), ['12']);
});
