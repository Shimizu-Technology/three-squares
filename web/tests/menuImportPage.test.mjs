import { uiModules, requireUi } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as receipts from '../src/components/admin/import/menuImportReceipt.ts';
import { readProductListReturn, safeProductReturnTo } from '../src/components/admin/products/productQueryState.ts';

// Render the real page with deterministic auth/router boundaries. Browser focus,
// uploads and viewport interactions remain parent-owned acceptance checks.
const require = createRequire(import.meta.url);
let fixture;
let legacyMounts = 0;
const source = readFileSync(new URL('../src/pages/admin/AdminImportPage.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const mockRequire = name => {
  if (name === '@clerk/clerk-react') return { useAuth: () => ({ userId: fixture.userId, getToken: async () => 'test-token' }) };
  if (name === 'react-router-dom') return {
    useSearchParams: () => [new URLSearchParams(fixture.search)],
    useLocation: () => ({ state: fixture.state }),
    useNavigate: () => (...args) => (fixture.navigations ||= []).push(args),
    Link: ({ to, children, ...props }) => { if (props.onClick) fixture.backClick = props.onClick; return React.createElement('a', { href: to, ...props }, children); },
  };
  if (name.includes('/StaffAccess')) return { useStaffAccess: () => ({ loading: fixture.loading, can: capability => fixture.caps.includes(capability) }) };
  if (name.includes('/productQueryState')) return { readProductListReturn, safeProductReturnTo };
  if (name.includes('/menuImportReceipt')) return receipts;
  if (name.includes('/authApi')) return { authPost: () => { throw Error('Unexpected request in render'); } };
  if (name === './AdminShopifyMigration') return { default: () => { legacyMounts++; return React.createElement('h1', null, 'Legacy migration fixture'); } };
  if (uiModules[name]) return requireUi(name, mockRequire);
  return require(name);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
const Page = module.exports.default;
function render(overrides = {}) {
  fixture = { userId: 'ui-user', loading: false, caps: ['catalog.import'], search: '', ...overrides };
  legacyMounts = 0;
  return renderToStaticMarkup(React.createElement(Page));
}
function storage() {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function receipt() {
  return receipts.createMenuImportReceipt('Menu <script>.csv', {
    imported: 2, skipped: 1, total: 3,
    created: [
      { row: 2, product_id: 12, name: 'Published meal', published: true, needs_pickup_locations: false },
      { row: 3, product_id: 29, name: 'Draft meal', published: false, needs_pickup_locations: true },
    ],
    errors: [{ row: 4, name: 'Bad meal', error: `Invalid price <script>${'a'.repeat(500)}</script>` }],
    notices: [{ row: 3, product_id: 29, message: 'Add pickup locations' }],
  });
}

test('Menu CSV is default; Shopify entry requires both capabilities', () => {
  storage();
  const scoped = render();
  assert.match(scoped, /Import menu items/);
  assert.match(scoped, /name<\/code>, <code>price/);
  assert.match(scoped, /2,000/);
  assert.doesNotMatch(scoped, /href="\/admin\/import\?format=shopify"/);
  assert.equal(legacyMounts, 0);
  assert.match(render({ caps: ['catalog.import', 'stock.manage'] }), /href="\/admin\/import\?format=shopify"/);
  assert.doesNotMatch(render({ caps: ['stock.manage'] }), /type="file"/);
});

test('ineligible direct Shopify request explains permission without mounting legacy', () => {
  storage();
  const denied = render({ search: 'format=shopify' });
  assert.match(denied, /requires shared-stock permission/);
  assert.match(denied, /href="\/admin\/import"/);
  assert.doesNotMatch(denied, /type="file"/);
  assert.equal(legacyMounts, 0);
  assert.match(render({ search: 'format=shopify', caps: ['catalog.import', 'stock.manage'] }), /Legacy migration fixture/);
  assert.equal(legacyMounts, 1);
  assert.match(render({ search: 'format=shopify', loading: true }), /Checking import access/);
  assert.equal(legacyMounts, 0);
});

test('receipt links use exact committed IDs and UUID batch; rejected rows have correction tasks only', () => {
  storage();
  const saved = receipt();
  assert.equal(receipts.saveMenuImportReceipt('ui-results-user', saved), true);
  const html = render({ userId: 'ui-results-user' });
  const batch = `/admin/products?batch=${saved.id}`;
  for (const id of [12, 29]) assert.ok(html.includes(`href="/admin/products/${id}/edit?returnTo=${encodeURIComponent(batch)}"`));
  assert.ok(html.includes(`href="${batch}"`));
  assert.ok(html.includes(`href="${batch}&amp;published=pickup_locations"`));
  assert.match(html, /2 created · 1 skipped · 3 total rows/);
  assert.match(html, /Unpublished draft — add pickup locations/);
  assert.match(html, /No item was created for these rows/);
  assert.match(html, /Copy only these rows into a new CSV/);
  assert.match(html, /Row 4: Bad meal/);
  assert.equal((html.match(/\/edit\?returnTo=/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /\[overflow-wrap:anywhere\]/);
  assert.match(html, /This tab/);
});

test('memory fallback has honest retention and account-isolated output', () => {
  globalThis.sessionStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  const saved = receipt();
  assert.equal(receipts.saveMenuImportReceipt('ui-memory-user', saved), false);
  const html = render({ userId: 'ui-memory-user' });
  assert.match(html, /Tab storage is unavailable/);
  assert.match(html, /a reload may lose them/);
  assert.match(html, /switching devices does not preserve them/);
  const other = render({ userId: 'ui-other-user' });
  assert.doesNotMatch(other, /Completed import results/);
  assert.doesNotMatch(other, new RegExp(saved.id));
});

test('incoming returnTo uses the existing allowlist', () => {
  storage();
  const valid = render({ search: new URLSearchParams({ returnTo: '/admin/products?q=Adobo&page=2' }).toString() });
  assert.match(valid, /href="\/admin\/products\?q=Adobo&amp;page=2"/);
  const invalid = render({ search: new URLSearchParams({ returnTo: 'https://evil.test' }).toString() });
  assert.match(invalid, /href="\/admin\/products"/);
  assert.doesNotMatch(invalid, /evil.test/);
});

test('Back to Products pops the proven list entry or replaces a direct import entry', () => {
  storage();
  const path = '/admin/products?q=Adobo&page=3';
  const metadata = { path, entryKey: 'saved-list', index: 4 };
  globalThis.window = { history: { state: { idx: 5 } } };
  render({ search: new URLSearchParams({ returnTo: path }).toString(), state: { productListReturn: metadata } });
  let prevented = false;
  fixture.backClick({ button: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(fixture.navigations, [[-1]]);
  window.history.state.idx = 8;
  render({ search: new URLSearchParams({ returnTo: path }).toString(), state: { productListReturn: metadata } });
  fixture.backClick({ button: 0, preventDefault() {} });
  assert.deepEqual(fixture.navigations, [[path, { replace: true, state: { productScrollEntry: 'saved-list' } }]]);
  render({ search: '', state: null }); fixture.backClick({ button: 0, preventDefault() {} });
  assert.deepEqual(fixture.navigations, [['/admin/products', { replace: true, state: null }]]);
});
