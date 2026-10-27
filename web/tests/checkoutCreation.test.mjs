import test from 'node:test';
import assert from 'node:assert/strict';
import { readPendingCreation, savePendingCreation, clearPendingCreation, creationRejected } from '../src/lib/checkoutCreation.ts';
test('keeps the original owner, payload and operation across a lost response and reload', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const original = { key: 'original-operation', capability: 'a'.repeat(64), cartSession: 'original-cart', owner: 'user-original', order: { location_id: 1, customer_name: 'Fixture' } };
  savePendingCreation(original, storage);
  assert.deepEqual({ ...readPendingCreation(storage), expires: undefined }, { ...original, expires: undefined });
  const value = JSON.parse(data.values().next().value);
  value.expires = 1;
  data.set('tsq-checkout-creation', JSON.stringify(value));
  assert.equal(readPendingCreation(storage).key, original.key);
  clearPendingCreation(storage);
  assert.equal(readPendingCreation(storage), null);
});
test('only authoritative pre-intent rejection permits discarding a retained request', () => {
  assert.equal(creationRejected({ response: { status: 422, data: { checkout_rejected_before_intent: true } } }), true);
  for (const error of [{}, { response: { status: 401 } }, { response: { status: 409 } }, { response: { status: 422 } }, { response: { status: 422, data: { checkout_rejected_before_intent: false } } }]) assert.equal(creationRejected(error), false);
});
