import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CSV_TEMPLATE, createMenuImportReceipt, saveMenuImportReceipt, readMenuImportReceipt,
  isMenuImportResult, isMenuImportReceiptPersisted,
} from '../src/components/admin/import/menuImportReceipt.ts';

const result = () => ({
  imported: 2, skipped: 1, total: 3,
  created: [
    { row: 2, product_id: 41, name: 'Adobo', published: true, needs_pickup_locations: false },
    { row: 3, product_id: 42, name: 'Draft 🥥', published: false, needs_pickup_locations: true },
  ],
  errors: [{ row: 4, name: 'Bad price', error: 'Price must be a non-negative number with up to 2 decimals' }],
  notices: [{ row: 3, product_id: 42, name: 'Draft 🥥', message: 'Add pickup locations before publishing' }],
});
const key = user => `three-squares:menu-import:v1:${encodeURIComponent(user)}`;
function storage() {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  return values;
}

test('template documents the complete Menu CSV header and safe blank-location draft', () => {
  assert.equal(CSV_TEMPLATE.split('\n')[0], 'name,price,description,category_name,active,locations');
  assert.match(CSV_TEMPLATE.split('\n')[1], /,$/);
});

test('receipt has a UUID and independent snapshot, and survives a fresh module/reload', async () => {
  storage();
  const source = result();
  const receipt = createMenuImportReceipt('Menu 🥥.csv', source);
  assert.match(receipt.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(receipt.version, 1);
  assert.ok(Number.isFinite(Date.parse(receipt.createdAt)));
  source.created[0].name = 'Changed';
  assert.equal(receipt.result.created[0].name, 'Adobo');
  assert.equal(saveMenuImportReceipt('reload-user', receipt), true);
  assert.equal(isMenuImportReceiptPersisted('reload-user', receipt.id), true);
  const fresh = await import(`../src/components/admin/import/menuImportReceipt.ts?reload=${receipt.id}`);
  assert.deepEqual(fresh.readMenuImportReceipt('reload-user'), receipt);
  assert.deepEqual(fresh.readMenuImportReceipt('reload-user', receipt.id), receipt);
  const read = readMenuImportReceipt('reload-user');
  read.result.created[0].product_id = 999;
  assert.equal(readMenuImportReceipt('reload-user').result.created[0].product_id, 41);
});

test('accounts and requested batches stay isolated; unsafe or unknown batch never falls back to latest', () => {
  const values = storage();
  const receipt = createMenuImportReceipt('menu.csv', result());
  saveMenuImportReceipt('user:a/b', receipt);
  assert.equal(readMenuImportReceipt('user:b'), null);
  assert.equal(readMenuImportReceipt('user:a/b', crypto.randomUUID()), null);
  for (const bad of ['', '41,42', '../x', 'https://evil.test', 'constructor']) {
    assert.equal(readMenuImportReceipt('user:a/b', bad), null);
  }
  values.set(key('user:b'), values.get(key('user:a/b')));
  assert.equal(readMenuImportReceipt('user:b'), null);
  assert.equal(saveMenuImportReceipt('', receipt), false);
  assert.equal(readMenuImportReceipt(''), null);
});

test('only five recent batches remain and re-saving an ID promotes it without duplication', () => {
  const values = storage();
  const receipts = Array.from({ length: 7 }, (_, i) => createMenuImportReceipt(`menu-${i}.csv`, result()));
  receipts.forEach(receipt => saveMenuImportReceipt('recent-user', receipt));
  assert.equal(readMenuImportReceipt('recent-user').id, receipts[6].id);
  assert.equal(readMenuImportReceipt('recent-user', receipts[0].id), null);
  assert.equal(readMenuImportReceipt('recent-user', receipts[1].id), null);
  assert.equal(readMenuImportReceipt('recent-user', receipts[2].id).id, receipts[2].id);
  saveMenuImportReceipt('recent-user', receipts[3]);
  const envelope = JSON.parse(values.get(key('recent-user')));
  assert.equal(envelope.receipts.length, 5);
  assert.equal(new Set(envelope.receipts.map(receipt => receipt.id)).size, 5);
  assert.equal(readMenuImportReceipt('recent-user').id, receipts[3].id);
});

test('corrupt and untrusted storage cannot manufacture row links or success', () => {
  const values = storage();
  const receipt = createMenuImportReceipt('valid.csv', result());
  saveMenuImportReceipt('corrupt-user', receipt);
  const good = { version: 1, userId: 'corrupt-user', receipts: [receipt] };
  const cases = ['{broken', 'null', '[]', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, userId: 'other' }),
    JSON.stringify({ ...good, receipts: [receipt, receipt] })];
  const mutate = fn => {
    const next = structuredClone(good);
    fn(next.receipts[0]);
    cases.push(JSON.stringify(next));
  };
  mutate(r => { r.version = 2; });
  mutate(r => { r.id = '41,42'; });
  mutate(r => { r.createdAt = 'not-a-date'; });
  mutate(r => { r.result.created[0].product_id = '41/edit?evil'; });
  mutate(r => { r.result.created[1].published = true; });
  mutate(r => { r.result.created[1].needs_pickup_locations = 'false'; });
  mutate(r => { r.result.created[1].row = 2; });
  mutate(r => { r.result.created[1].product_id = 41; });
  mutate(r => { r.result.errors[0].product_id = 41; });
  mutate(r => { r.result.notices[0].product_id = 99; });
  mutate(r => { r.result.notices[0].row = 2; });
  mutate(r => { r.result.imported = 0; });
  mutate(r => { r.result.total = 2001; });
  mutate(r => { r.result.created = []; });
  for (const raw of cases) {
    values.set(key('corrupt-user'), raw);
    assert.equal(readMenuImportReceipt('corrupt-user'), null, raw);
    assert.equal(isMenuImportReceiptPersisted('corrupt-user', receipt.id), false);
  }
});

test('unknown, empty and inconsistent responses fail validation; all-skipped import remains actionable', () => {
  for (const value of [null, {}, { imported: 0, skipped: 0, total: 0, created: [], errors: [], notices: [] },
    { ...result(), created: undefined }, { ...result(), notices: undefined }]) {
    assert.equal(isMenuImportResult(value), false);
    assert.throws(() => createMenuImportReceipt('menu.csv', value));
  }
  assert.equal(isMenuImportResult({ imported: 0, skipped: 1, total: 1, created: [], errors: [{ row: 2, error: 'Name required' }], notices: [] }), true);
});

test('denied storage uses account-scoped memory for SPA navigation, bounded to five batches', () => {
  globalThis.sessionStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  const receipts = Array.from({ length: 6 }, () => createMenuImportReceipt('fallback.csv', result()));
  for (const receipt of receipts) assert.equal(saveMenuImportReceipt('fallback-user', receipt), false);
  assert.deepEqual(readMenuImportReceipt('fallback-user'), receipts[5]);
  assert.equal(readMenuImportReceipt('fallback-user', receipts[0].id), null);
  assert.equal(readMenuImportReceipt('another-fallback-user'), null);
  assert.equal(isMenuImportReceiptPersisted('fallback-user', receipts[5].id), false);
});

test('quota failure with readable old storage returns the newly confirmed batch, then can persist again', () => {
  const values = storage();
  const first = createMenuImportReceipt('first.csv', result());
  const next = createMenuImportReceipt('next.csv', result());
  saveMenuImportReceipt('quota-user', first);
  globalThis.sessionStorage.setItem = () => { throw Error('quota'); };
  assert.equal(saveMenuImportReceipt('quota-user', next), false);
  assert.deepEqual(readMenuImportReceipt('quota-user'), next);
  assert.equal(isMenuImportReceiptPersisted('quota-user', next.id), false);
  assert.equal(isMenuImportReceiptPersisted('quota-user', first.id), true);
  globalThis.sessionStorage.setItem = (name, value) => values.set(name, value);
  assert.equal(saveMenuImportReceipt('quota-user', next), true);
  assert.deepEqual(readMenuImportReceipt('quota-user', first.id), first);
});
