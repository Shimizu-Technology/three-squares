import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountingFileDigest, accountingStorageKey, assertSavedAccountingAction, clearAccountingAction,
  confirmedAccountingResult, defaultAccountingDates, formatAccountingCents, MAX_ACCOUNTING_FILE_BYTES, parseSignedCents,
  prepareAccountingAction, readAccountingAction, sameAccountingContext, validAccountingDates,
} from '../src/services/paymentReconciliation.ts';
const dbId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { identity_id: dbId(11), environment: 'production' };
const allocation = { kind: 'allocate', batch_id: dbId(12), deposit_id: dbId(13), amount_cents: -109, reason: 'Documented adjustment' };
function storageFixture() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('integer cents format exactly, including negative and largest safe values', () => {
  assert.equal(formatAccountingCents(0), '$0.00');
  assert.equal(formatAccountingCents(1), '$0.01');
  assert.equal(formatAccountingCents(-109), '−$1.09');
  assert.equal(formatAccountingCents(Number.MAX_SAFE_INTEGER), '$90,071,992,547,409.91');
  for (const invalid of [NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(formatAccountingCents(invalid), 'Amount unavailable');
  assert.equal(parseSignedCents('-109'), -109);
  for (const invalid of ['0', '-0', '1.01', '1e3', '1,000', '', '9007199254740992']) assert.equal(parseSignedCents(invalid), null);
});
test('Guam date defaults cross UTC midnight correctly and enforce inclusive 366-day range', () => {
  assert.deepEqual(defaultAccountingDates(new Date('2026-10-27T15:00:00Z')), { from: '2026-09-29', to: '2026-10-28' });
  assert.equal(validAccountingDates('2024-01-01', '2024-12-31'), true);
  assert.equal(validAccountingDates('2024-01-01', '2025-01-01'), false);
  assert.equal(validAccountingDates('2026-02-29', '2026-03-01'), false);
  assert.equal(validAccountingDates('2026-10-28', '2026-10-27'), false);
  assert.equal(validAccountingDates('', '2026-10-28'), false);
});
test('CSV hashing checks raw UTF-8 bytes and file size without storing any content', async () => {
  const bytes = new TextEncoder().encode('abc');
  assert.equal(await accountingFileDigest(bytes.buffer), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(accountingFileDigest(new ArrayBuffer(0)), /nonempty/);
  await assert.rejects(accountingFileDigest(new ArrayBuffer(MAX_ACCOUNTING_FILE_BYTES + 1)), /1 MiB/);
  const storage = storageFixture();
  const saved = prepareAccountingAction({ kind: 'import', file_sha256: await accountingFileDigest(bytes.buffer) }, 4, context, storage);
  assert.deepEqual(readAccountingAction(storage).pending, saved);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(accountingStorageKey))).sort(), ['actor_id', 'environment', 'file_sha256', 'identity_id', 'key', 'kind', 'version']);
});
test('lost allocation response survives reload with original signed amount, reason and key', () => {
  const storage = storageFixture();
  const original = prepareAccountingAction(allocation, 4, context, storage);
  const reloaded = readAccountingAction(storage).pending;
  assert.deepEqual(reloaded, original);
  assert.doesNotThrow(() => assertSavedAccountingAction(reloaded, 4, context, storage));
  assert.throws(() => prepareAccountingAction({ ...allocation, amount_cents: -200 }, 4, context, storage), /Resolve the saved/);
  assert.deepEqual(readAccountingAction(storage).pending, original);
  assert.throws(() => assertSavedAccountingAction({ ...original, reason: 'Changed' }, 4, context, storage), /saved request/);
});
test('actor, identity and environment changes cannot replay another saved request', () => {
  const storage = storageFixture();
  const original = prepareAccountingAction(allocation, 4, context, storage);
  assert.equal(sameAccountingContext(original, 5, context), false);
  assert.throws(() => assertSavedAccountingAction(original, 5, context, storage), /account changed/);
  assert.throws(() => assertSavedAccountingAction(original, 4, { ...context, identity_id: dbId(20) }, storage), /account changed/);
  assert.throws(() => assertSavedAccountingAction(original, 4, { ...context, environment: 'sandbox' }, storage), /account changed/);
  clearAccountingAction(original, storage);
  const next = prepareAccountingAction(allocation, 4, context, storage);
  assert.notEqual(next.key, original.key);
  clearAccountingAction(original, storage);
  assert.deepEqual(readAccountingAction(storage).pending, next);
});
test('invalid or extra persisted fields fail closed, including accidental CSV/card fields', () => {
  const storage = storageFixture();
  const original = prepareAccountingAction(allocation, 4, context, storage);
  for (const corruption of ['{', JSON.stringify({ ...original, amount_cents: 0 }), JSON.stringify({ ...original, csv: 'content' }), JSON.stringify({ ...original, card_number: 'not permitted' }), JSON.stringify({ ...original, actor_id: null })]) {
    storage.setItem(accountingStorageKey, corruption);
    assert.deepEqual(readAccountingAction(storage), { pending: null, blocked: true });
    assert.throws(() => prepareAccountingAction(allocation, 4, context, storage), /Resolve the saved/);
  }
});
test('unavailable storage prevents dispatch preparation rather than silently losing recovery', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); }, removeItem: () => {} };
  assert.throws(() => prepareAccountingAction(allocation, 4, context, storage), /Storage unavailable/);
});
test('simulated mutations preserve exact close, clock and explicit void target after reload', () => {
  for (const action of [
    { kind: 'simulate_close', scenario: 'split', lag_days: 14, fee_cents: 10000 },
    { kind: 'advance_simulation', seconds: 259200 },
    { kind: 'simulate_void', attempt_id: dbId(17), order_number: 'ORDER-EXACT', amount_cents: 12345 },
  ]) {
    const storage = storageFixture();
    const simulated = { identity_id: dbId(22), environment: 'simulated' };
    const original = prepareAccountingAction(action, 4, simulated, storage);
    assert.deepEqual(readAccountingAction(storage).pending, original);
    assert.doesNotThrow(() => assertSavedAccountingAction(original, 4, simulated, storage));
    assert.throws(() => prepareAccountingAction({ ...action, attempt_id: dbId(99) }, 4, simulated, storage), /Resolve the saved/);
    const otherStorage = storageFixture();
    assert.throws(() => prepareAccountingAction(action, 4, context, otherStorage), /Invalid accounting request/);
  }
});

test('only confirmed original import facts release recovery; conflicts and pending results retain it', () => {
  const storage = storageFixture();
  const pending = prepareAccountingAction({ kind: 'import', file_sha256: 'a'.repeat(64) }, 4, context, storage);
  const data = { id: dbId(12), operation_key: pending.key, payload_digest: pending.file_sha256, state: 'succeeded' };
  assert.equal(confirmedAccountingResult(pending, { status: 200, data }), true);
  assert.equal(confirmedAccountingResult(pending, { status: 200, data: { ...data, state: 'conflicted' } }), true);
  for (const response of [
    { status: 202, data }, { status: 200, data: { ...data, payload_digest: 'b'.repeat(64) } },
    { status: 200, data: { ...data, operation_key: crypto.randomUUID() } },
    { status: 200, data: { ...data, state: 'processing' } }, { status: 200, data: { ...data, pending: true } },
  ]) assert.equal(confirmedAccountingResult(pending, response), false);
  assert.deepEqual(readAccountingAction(storage).pending, pending);
});
test('unknown voids keep the original target; HTTP 200 failed voids are definitive failures', () => {
  const pending = prepareAccountingAction({ kind: 'simulate_void', attempt_id: dbId(17), order_number: 'ORDER-EXACT', amount_cents: 12345 }, 4, { identity_id: dbId(22), environment: 'simulated' }, storageFixture());
  assert.equal(confirmedAccountingResult(pending, { status: 202, data: { success: false, status: 'unknown' } }), false);
  assert.equal(confirmedAccountingResult(pending, { status: 200, data: { success: false, status: 'unknown' } }), false);
  assert.equal(confirmedAccountingResult(pending, { status: 200, data: { success: false, status: 'failed', error: 'Refund failed' } }), true);
  assert.equal(confirmedAccountingResult(pending, { status: 200, data: { success: true, status: 'succeeded' } }), true);
});
test('allocation confirmation must return the exact signed amount, and reviews the exact reason', () => {
  const allocationRequest = prepareAccountingAction(allocation, 4, context, storageFixture());
  assert.equal(confirmedAccountingResult(allocationRequest, { status: 200, data: { id: dbId(31), amount_cents: -109 } }), true);
  assert.equal(confirmedAccountingResult(allocationRequest, { status: 200, data: { id: dbId(31), amount_cents: 109 } }), false);
  const reviewRequest = prepareAccountingAction({ kind: 'review', exception_id: dbId(9), reason: 'Evidence checked' }, 4, context, storageFixture());
  assert.equal(confirmedAccountingResult(reviewRequest, { status: 200, data: { id: dbId(9), state: 'reviewed', review_reason: 'Evidence checked' } }), true);
  assert.equal(confirmedAccountingResult(reviewRequest, { status: 200, data: { id: dbId(9), state: 'reviewed', review_reason: 'Other reason' } }), false);
});

test('a browser storage access failure blocks recovery without pretending there is no request', () => {
  const denied = { getItem: () => { throw new Error('Storage access denied'); }, setItem: () => {}, removeItem: () => {} };
  assert.deepEqual(readAccountingAction(denied), { pending: null, blocked: true });
});

test('API UUIDs survive recovery and numeric accounting identifiers are rejected', () => {
  const storage = storageFixture();
  const pending = prepareAccountingAction(allocation, 4, context, storage);
  assert.equal(typeof pending.identity_id, 'string');
  assert.equal(pending.identity_id, dbId(11));
  assert.equal(readAccountingAction(storage).pending.batch_id, dbId(12));
  storage.setItem(accountingStorageKey, JSON.stringify({ ...pending, identity_id: 11 }));
  assert.deepEqual(readAccountingAction(storage), { pending: null, blocked: true });
  assert.equal(confirmedAccountingResult(pending, { status: 200, data: { id: 31, amount_cents: -109 } }), false);
});
