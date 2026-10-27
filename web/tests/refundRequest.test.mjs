import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareRefundRequest, savedRefundRequest, clearRefundRequest } from '../src/lib/refundRequest.ts';
function fixture() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const payload = { amount_cents: 500, reason: 'Returned item', restock_items: true };
test('lost-response and reload retries retain the original refund request and stock decision', () => {
  const storage = fixture();
  const first = prepareRefundRequest(12, 'staff-a', payload, storage);
  assert.deepEqual(savedRefundRequest(12, storage), first);
  assert.equal(prepareRefundRequest(12, 'staff-a', { ...payload }, storage).key, first.key);
  assert.throws(() => prepareRefundRequest(12, 'staff-a', { ...payload, amount_cents: 600 }, storage), /Check the saved refund/);
  assert.throws(() => prepareRefundRequest(12, 'staff-a', { ...payload, restock_items: false }, storage), /Check the saved refund/);
  assert.deepEqual(savedRefundRequest(12, storage), first);
});
test('staff changes cannot reuse another session refund; only resolved requests receive a new key', () => {
  const storage = fixture();
  const first = prepareRefundRequest(12, 'staff-a', payload, storage);
  assert.throws(() => prepareRefundRequest(12, 'staff-b', payload, storage), /another staff session/);
  assert.throws(() => prepareRefundRequest(12, null, payload, storage), /Sign in/);
  clearRefundRequest(12, first.key, storage);
  const next = prepareRefundRequest(12, 'staff-a', payload, storage);
  assert.notEqual(next.key, first.key);
});

test('a late response cannot erase a different saved refund from another tab', () => {
  const storage = fixture();
  const first = prepareRefundRequest(12, 'staff-a', payload, storage);
  clearRefundRequest(12, first.key, storage);
  const next = prepareRefundRequest(12, 'staff-a', { ...payload, amount_cents: 200 }, storage);
  clearRefundRequest(12, first.key, storage);
  assert.deepEqual(savedRefundRequest(12, storage), next);
});
