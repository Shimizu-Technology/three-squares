import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const ctx = 'globalThis.__productListContext';
const modules = {
  react: dataModule(['useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useCallback'].map(name => `export const ${name} = (...args) => ${ctx}.${name}(...args);`).join('\n')),
  '@clerk/clerk-react': dataModule(`const getToken = async () => 'synthetic'; export const useAuth = () => ({ getToken, userId: 'list-test' });`),
  'react-router-dom': dataModule(`export const useLocation = () => ${ctx}.location; export const useNavigate = () => ${ctx}.navigate; export const useNavigationType = () => ${ctx}.navigationType;`),
  'react-hot-toast': dataModule('export default { success() {}, error() {} };'),
  '../../components/admin/products': dataModule('export function ProductFilters() {} export function ProductsTable() {} export function ProductDetailModal() {}'),
  '../../components/admin/AdminRequestState': dataModule('export default function AdminRequestState() {}'),
  '../../components/admin': dataModule('export function SkeletonListPage() {}'),
  '../../services/authApi': dataModule(`export const authGet = (...args) => ${ctx}.get(...args); export const authPatch = async () => ({}); export const authPost = async () => ({});`),
  '../../components/admin/products/productQueryState': new URL('../src/components/admin/products/productQueryState.ts', import.meta.url).href,
};
const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/admin/AdminProductsPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(modules[name] || import.meta.resolve(name))}`);
const { default: Page } = await import(dataModule(compiled));
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
const products = Array.from({ length: 80 }, (_, index) => ({
  id: index + 1, slug: `adobo-${index}`, name: `Adobo ${index}`, published: true, archived: false,
  product_type: 'local', base_price_cents: index * 100, inventory_level: 'none', created_at: new Date(index * 100000).toISOString(),
}));
let entry = 0;
function harness(search = '?q=Adobo&published=true&type=local&sort=price&dir=desc&page=3') {
  const state = [], effects = [], layoutEffects = [], events = new Map(), values = new Map(), history = [], future = [];
  let cursor = 0, tree;
  const h = {
    location: { pathname: '/admin/products', search, key: `initial-${++entry}`, state: null }, navigationType: 'POP', calls: [], values,
    get: async path => ({ data: { data: path === '/admin/products' ? products : { ...products[0], images: [], variants: [], collections: [] } } }),
    navigate(path, options = {}) {
      h.calls.push([path, options]);
      if (!options.replace) { history.push(h.location); future.length = 0; }
      const [pathname, query = ''] = path.split('?');
      h.location = { pathname, search: query ? `?${query}` : '', key: `entry-${++entry}`, state: options.state || null };
      h.navigationType = options.replace ? 'REPLACE' : 'PUSH';
      if (!options.replace) window.history.state.idx++;
    },
    pop() { future.push(h.location); h.location = history.pop(); h.navigationType = 'POP'; window.history.state.idx--; },
    forward() { history.push(h.location); h.location = future.pop(); h.navigationType = 'POP'; window.history.state.idx++; },
    useState(initial) { const key = cursor++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(value) { const key = cursor++; return state[key] ||= { current: value }; },
    useCallback(callback, deps) { const key = cursor++; if (!state[key] || deps.some((value, index) => !Object.is(value, state[key].deps[index]))) state[key] = { callback, deps }; return state[key].callback; },
    effect(queue, callback, deps) { const key = cursor++; if (!state[key] || deps.some((value, index) => !Object.is(value, state[key].deps[index]))) queue.push(() => { state[key]?.cleanup?.(); state[key] = { deps, cleanup: callback() }; }); },
    useEffect(callback, deps) { h.effect(effects, callback, deps); },
    useLayoutEffect(callback, deps) { h.effect(layoutEffects, callback, deps); },
    async flush() { for (let i = 0; i < 7; i++) { globalThis.__productListContext = h; cursor = 0; tree = Page(); for (const effect of [...layoutEffects.splice(0), ...effects.splice(0)]) effect(); await Promise.resolve(); } },
    component(name) { return elements(tree).find(node => node.type?.name === name)?.props; },
    button(name) { return elements(tree).find(node => node.type === 'button' && [node.props.children].flat(Infinity).includes(name)); },
    unmount() { state.forEach(value => value?.cleanup?.()); },
    scroll(y) { window.scrollY = y; events.get('scroll')?.(); },
  };
  globalThis.window = { get location() { return h.location; }, scrollY: 0, history: { state: { idx: 2 } }, scrollTo: ({ top }) => { window.scrollY = top; }, addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) };
  globalThis.document = { body: { style: {} }, activeElement: null };
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  return h;
}

test('list initializes every URL control, sorts before paginating, and POP restores page/scroll without a reset effect', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.component('ProductFilters').searchQuery, 'Adobo');
  assert.equal(h.component('ProductFilters').filterPublished, 'true');
  assert.equal(h.component('ProductFilters').filterType, 'local');
  assert.equal(h.component('ProductsTable').currentPage, 3);
  assert.equal(h.component('ProductsTable').products[0].base_price_cents, 2900);
  h.scroll(740);
  h.component('ProductsTable').onSort('name');
  await h.flush();
  assert.equal(h.component('ProductsTable').currentPage, 1);
  h.scroll(180);
  h.pop();
  await h.flush();
  assert.equal(h.component('ProductsTable').currentPage, 3);
  assert.equal(h.component('ProductsTable').sortBy, 'price');
  assert.equal(window.scrollY, 740);
  h.forward();
  await h.flush();
  assert.equal(h.component('ProductsTable').currentPage, 1);
  assert.equal(h.component('ProductsTable').sortBy, 'name');
  assert.equal(window.scrollY, 180);
  h.unmount();
});

test('table, detail-modal and Add Product callbacks retain a validated return URL and the source history entry', async () => {
  for (const source of ['table', 'modal', 'add']) {
    const h = harness();
    await h.flush();
    h.scroll(615);
    const sourceKey = h.location.key;
    const sourcePath = h.location.pathname + h.location.search;
    if (source === 'table') h.component('ProductsTable').onEdit(products[0]);
    else if (source === 'add') h.button('Add Product').props.onClick();
    else {
      await h.component('ProductsTable').onView(products[0]);
      await h.flush();
      h.component('ProductDetailModal').onEdit(products[0]);
    }
    const [path, options] = h.calls.at(-1);
    assert.equal(path.split('?')[0], source === 'add' ? '/admin/products/new' : '/admin/products/1/edit');
    assert.equal(new URLSearchParams(path.split('?')[1]).get('returnTo'), sourcePath);
    assert.deepEqual(options.state.productListReturn, { path: sourcePath, entryKey: sourceKey, index: 2 });
    h.unmount();
  }
});

test('stale page clamps only after data arrives and creates no history entry; Created sort uses server timestamps', async () => {
  const h = harness('?sort=created&dir=desc&page=99');
  await h.flush();
  assert.equal(h.component('ProductsTable').currentPage, 4);
  assert.equal(h.component('ProductsTable').products[0].id, 5);
  assert.deepEqual(h.calls.map(([path, options]) => [path, options.replace]), [['/admin/products?sort=created&dir=desc&page=4', true]]);
  h.unmount();
});

test('search edits coalesce within a focus session but POP ends the session so subsequent edits cannot overwrite history', async () => {
  const h = harness('');
  await h.flush();
  h.component('ProductFilters').onSearchChange('A');
  await h.flush();
  h.component('ProductFilters').onSearchChange('Ad');
  await h.flush();
  assert.equal(h.calls.at(-1)[1].replace, true);
  h.pop();
  await h.flush();
  h.component('ProductFilters').onSearchChange('B');
  assert.equal(h.calls.at(-1)[1].replace, false);
  h.unmount();
});

test('a scroll event from the departing editor cannot overwrite the saved list position before cleanup', async () => {
  const h = harness();
  await h.flush();
  h.scroll(2755);
  h.component('ProductsTable').onEdit(products[0]);
  // Simulate the DOM shrinking after pushState while the old callback still exists.
  h.scroll(0);
  const saved = [...h.values.entries()].filter(([key]) => key.includes('product-scroll'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0][1], '2755');
  h.unmount();
});
