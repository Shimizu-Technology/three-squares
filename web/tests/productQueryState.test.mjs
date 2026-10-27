import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProductQuery, productListPath, safeProductReturnTo, clampProductPage,
  productScrollKey, readProductScroll, writeProductScroll, readProductListReturn,
} from '../src/components/admin/products/productQueryState.ts';

test('all list controls round-trip with Unicode, reserved query characters and non-default pagination', () => {
  const state = { q: 'Adobo & kelaguen / 🥥', published: 'attention', type: 'local meal', sort: 'stock', dir: 'desc', page: 4 };
  const path = productListPath(state);
  assert.deepEqual(parseProductQuery(path.split('?')[1]), state);
  assert.equal(safeProductReturnTo(path), path);
  for (const published of ['all', 'true', 'false', 'archived', 'attention']) {
    for (const sort of ['name', 'price', 'stock', 'created']) {
      for (const dir of ['asc', 'desc']) {
        const next = { ...state, published, sort, dir };
        assert.deepEqual(parseProductQuery(productListPath(next).split('?')[1]), next);
      }
    }
  }
});

test('invalid URL input uses bounded defaults and stable canonical serialization', () => {
  const defaults = parseProductQuery('');
  assert.equal(productListPath(defaults), '/admin/products');
  for (const page of ['0', '-2', '3.5', '2e2', 'Infinity', 'NaN', '9007199254740992', '01']) {
    assert.equal(parseProductQuery(`?page=${page}`).page, 1);
  }
  const state = parseProductQuery(`?q=${'a'.repeat(501)}&published=oops&type=%00&sort=oops&dir=oops&page=2`);
  assert.deepEqual(state, { ...defaults, page: 2 });
  const canonical = productListPath(parseProductQuery('?unused=x&page=2&sort=price&dir=desc'));
  assert.equal(canonical, '/admin/products?sort=price&dir=desc&page=2');
  assert.equal(productListPath(parseProductQuery(canonical.split('?')[1])), canonical);
});

test('returnTo accepts only an exact local products path and validated whitelisted query keys', () => {
  for (const value of [
    undefined, null, 42, {}, 'https://example.test/admin/products', '//example.test/admin/products',
    '/admin/orders', '/admin/products/new', '/admin/products/1/edit', '/admin/products/',
    '/admin/products#x', '/admin/products/../orders', '/admin%2fproducts', '/admin/products\\evil',
    '/admin/products?returnTo=/admin/orders', '/admin/products?page=0&q=Adobo',
    '/admin/products?published=bad&q=Adobo', '/admin/products?q=a&q=b',
    '/admin/products?q=%00', '/admin/products?sort=unknown', '/admin/products?dir=sideways',
  ]) assert.equal(safeProductReturnTo(value), '/admin/products', String(value));
  assert.equal(safeProductReturnTo('/admin/products?page=2&q=Adobo'), '/admin/products?q=Adobo&page=2');
  assert.equal(safeProductReturnTo('/admin/products?published=all&sort=name&dir=asc&page=1'), '/admin/products');
  assert.equal(safeProductReturnTo('/admin/products?q=https%3A%2F%2Fexample.test'), '/admin/products?q=https%3A%2F%2Fexample.test');
});

test('stale page clamps to remaining rows without turning empty or partial pages into page zero', () => {
  assert.equal(clampProductPage(5, 110), 5);
  assert.equal(clampProductPage(5, 100), 4);
  assert.equal(clampProductPage(5, 26), 2);
  assert.equal(clampProductPage(5, 0), 1);
  assert.equal(clampProductPage(2, 25), 1);
});

test('scroll storage distinguishes user, query and history entry; unavailable storage cannot crash navigation', () => {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const key = productScrollKey('owner', 'entry-a', '/admin/products?page=2');
  writeProductScroll(key, 874);
  assert.equal(readProductScroll(key), 874);
  for (const other of [productScrollKey('staff', 'entry-a', '/admin/products?page=2'), productScrollKey('owner', 'entry-b', '/admin/products?page=2'), productScrollKey('owner', 'entry-a', '/admin/products')]) assert.equal(readProductScroll(other), null);
  for (const raw of ['NaN', 'Infinity', '-1']) { values.set(key, raw); assert.equal(readProductScroll(key), null); }
  globalThis.sessionStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.doesNotThrow(() => writeProductScroll(key, 500));
  assert.equal(readProductScroll(key), null);
});

test('history return metadata must match the validated destination and an actual history index', () => {
  const path = '/admin/products?page=2';
  const source = { path, entryKey: 'list-entry', index: 3 };
  assert.deepEqual(readProductListReturn(source, path), source);
  for (const invalid of [null, {}, { ...source, index: -1 }, { ...source, index: 1.5 }, { ...source, path: '/admin/orders' }, { ...source, entryKey: 5 }]) assert.equal(readProductListReturn(invalid, path), null);
});
