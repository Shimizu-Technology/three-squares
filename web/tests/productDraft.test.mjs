import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProductDraft, productDraftKey, readProductDraft, writeProductDraft, discardProductDraft, discardSubmittedProductDraft,
} from '../src/components/admin/products/productDraft.ts';

const form = {
  name: 'Chicken Adobo 🥥', description: 'Lunch\nNo cutlery', product_type: 'local', vendor: 'Three Squares',
  base_price_cents: 1200, weight_oz: 0, published: false, featured: true,
  meta_title: '', meta_description: '', inventory_level: 'product', product_stock_quantity: 0,
  product_low_stock_threshold: 5, allow_pickup: true, allow_shipping: false,
  location_ids: [1, 2], collection_ids: [5], needs_attention: false, import_notes: '',
};
const envelope = (data = form, userId = 'owner', productId = '42') => JSON.stringify({ version: 1, userId, productId, data });
const setup = () => {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return values;
};

test('recovery validates identity, product, version and types while preserving all main-form fields', () => {
  assert.deepEqual(parseProductDraft(envelope(), 'owner', '42')?.data, form);
  for (const [user, product] of [['other', '42'], ['owner', '43'], ['owner', 'new'], ['', '42']]) assert.equal(parseProductDraft(envelope(), user, product), null);
  for (const raw of ['bad json', 'null', '{}', envelope().replace('"version":1', '"version":2')]) assert.equal(parseProductDraft(raw, 'owner', '42'), null);
  for (const invalid of [{ name: 42 }, { base_price_cents: null }, { published: 'false' }, { inventory_level: 'oops' }, { location_ids: ['1'] }, { collection_ids: [-1] }, { product_stock_quantity: '0' }]) assert.equal(parseProductDraft(envelope({ ...form, ...invalid }), 'owner', '42'), null);
});

test('images, variants and unknown API fields can never be restored into the main form', () => {
  const parsed = parseProductDraft(envelope({ ...form, images: [{ id: 1 }], variants: [{ id: 2 }], id: 42, arbitrary: 'ignored' }), 'owner', '42');
  assert.deepEqual(parsed.data, form);
});

test('reading stored recovery does not rewrite it; drafts remain isolated by user and product', () => {
  const values = setup();
  const key = productDraftKey('reader', '101');
  values.set(key, envelope(form, 'reader', '101'));
  assert.equal(readProductDraft('reader', '101').data.name, form.name);
  assert.equal(values.get(key), envelope(form, 'reader', '101'));
  assert.equal(readProductDraft('other-reader', '101'), null);
  assert.equal(readProductDraft('reader', '102'), null);
  assert.equal(readProductDraft('reader', 'new'), null);
});

test('a draft is removable after confirmed save/discard, including the separate new-product slot', () => {
  const values = setup();
  assert.equal(writeProductDraft('saving', 'new', form), true);
  assert.equal(writeProductDraft('saving', '104', { ...form, name: 'Different product' }), true);
  discardProductDraft('saving', 'new');
  assert.equal(values.has(productDraftKey('saving', 'new')), false);
  assert.equal(readProductDraft('saving', 'new'), null);
  assert.equal(readProductDraft('saving', '104').data.name, 'Different product');
});

test('storage read/write/delete exceptions preserve SPA recovery and never crash; removal has a memory tombstone', () => {
  globalThis.sessionStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.equal(readProductDraft('no-storage', '105'), null);
  assert.equal(writeProductDraft('no-storage', '105', form), false);
  assert.deepEqual(readProductDraft('no-storage', '105').data, form);
  assert.doesNotThrow(() => discardProductDraft('no-storage', '105'));
  assert.equal(readProductDraft('no-storage', '105'), null);
  assert.equal(writeProductDraft('', 'new', form), false);
});

test('a confirmed submission clears its own draft but cannot erase later edits after navigation', () => {
  const values = setup();
  values.set(productDraftKey('late-save', '42'), envelope(form, 'late-save', '42'));
  const submitted = readProductDraft('late-save', '42');
  assert.equal(readProductDraft('late-save', '42'), submitted);
  writeProductDraft('late-save', '42', { ...form, name: 'Newer unsaved lunch' });
  discardSubmittedProductDraft('late-save', '42', submitted);
  assert.equal(readProductDraft('late-save', '42').data.name, 'Newer unsaved lunch');
  const latest = readProductDraft('late-save', '42');
  discardSubmittedProductDraft('late-save', '42', latest);
  assert.equal(readProductDraft('late-save', '42'), null);
  writeProductDraft('late-create', 'new', form);
  const creation = readProductDraft('late-create', 'new');
  writeProductDraft('late-create', 'new', { ...form, name: 'Another new dish' });
  discardSubmittedProductDraft('late-create', 'new', creation);
  assert.equal(readProductDraft('late-create', 'new').data.name, 'Another new dish');
});
