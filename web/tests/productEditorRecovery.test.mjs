import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { productDraftKey, readProductDraft, writeProductDraft } from '../src/components/admin/products/productDraft.ts';

// Exercise editor event/effect boundaries with deterministic hooks and API promises.
// This is deliberately not browser acceptance: native validation, layout and scroll remain parent QA.
const mockModule = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const context = 'globalThis.__productEditorRecovery';
const imports = {
  react: mockModule(`export const useState = (...a) => ${context}.useState(...a); export const useRef = (...a) => ${context}.useRef(...a); export const useEffect = (...a) => ${context}.useEffect(...a);`),
  'react-router-dom': mockModule(`export const useParams = () => ({ id: ${context}.id }); export const useNavigate = () => ${context}.navigate; export const useLocation = () => ${context}.location;`),
  '@clerk/clerk-react': mockModule(`export const useAuth = () => ({ userId: ${context}.userId, getToken: async () => 'synthetic' });`),
  'react-hot-toast': mockModule('export default { success() {}, error() {} };'),
  '../../components/ImageUpload': mockModule('export default function ImageUpload() { return null; }'),
  '../../components/VariantManager': mockModule('export default function VariantManager() { return null; }'),
  '../../hooks/useLockBodyScroll': mockModule('export default function useLockBodyScroll() {}'),
  '../../services/authApi': mockModule(`export const authGet = (...a) => ${context}.get(...a); export const authPut = (...a) => ${context}.put(...a); export const authPost = (...a) => ${context}.post(...a); export const authDelete = async () => ({});`),
  '../../components/admin/products/productDraft': new URL('../src/components/admin/products/productDraft.ts', import.meta.url).href,
  '../../components/admin/products/productQueryState': new URL('../src/components/admin/products/productQueryState.ts', import.meta.url).href,
};
const source = readFileSync(new URL('../src/pages/admin/ProductFormPage.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(imports[name] || import.meta.resolve(name))}`);
const { default: Page } = await import(mockModule(compiled));
const nodes = node => {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
};
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const fresh = {
  id: 42, name: 'Fresh Adobo', description: 'Fresh from server', product_type: 'local', vendor: 'Three Squares',
  base_price_cents: 1200, weight_oz: 0, published: true, featured: false,
  meta_title: '', meta_description: '', inventory_level: 'none', product_low_stock_threshold: 5,
  allow_pickup: true, allow_shipping: false, location_ids: [1], collection_ids: [],
  needs_attention: false, import_notes: '', images: [{ id: 7, url: '/fresh.jpg' }],
};
let sequence = 0;
function harness(id = '42') {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = [], pending = [], events = new Map(), navigations = [];
  let cursor = 0, tree, page;
  const h = {
    id, userId: `editor-test-${++sequence}`, values, events, navigations,
    location: { search: `?${new URLSearchParams({ returnTo: '/admin/products?q=Adobo&page=3' })}`, state: { productListReturn: { path: '/admin/products?q=Adobo&page=3', entryKey: 'products-3', index: 4 } } },
    navigate: (...args) => navigations.push(args),
    get: async path => ({ data: { data: path.includes('/products/') ? fresh : path === '/admin/locations' ? [{ id: 1, name: 'Main', active: true }, { id: 2, name: 'Donki', active: true }] : [{ id: 5, name: 'Lunch' }] } }),
    put: async () => ({ data: { data: fresh } }),
    post: async () => ({ data: { data: { ...fresh, id: 99 } } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return state[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!state[index] || deps.some((value, i) => !Object.is(value, state[index].deps[i]))) {
        pending.push(() => { state[index]?.cleanup?.(); state[index] = { deps, cleanup: effect() }; });
      }
    },
    render() {
      globalThis.__productEditorRecovery = h;
      page = Page();
      cursor = 0;
      tree = page.type(page.props);
      return tree;
    },
    async flush() {
      for (let i = 0; i < 6; i++) {
        h.render();
        for (const effect of pending.splice(0)) effect();
        await Promise.resolve();
      }
      return tree;
    },
    find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected editor control'); return node; },
    button(name) { return h.find(node => node.type === 'button' && text(node).trim() === name); },
    field(name) { return h.find(node => node.props?.name === name); },
    async change(name, value, type = 'text') { h.field(name).props.onChange({ target: { name, value, type, checked: value } }); await h.flush(); },
    async submit() { await h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await h.flush(); },
    unmount() { for (const entry of state) entry?.cleanup?.(); },
    get tree() { return tree; }, get page() { return page; },
  };
  globalThis.window = { history: { state: { idx: 5 } }, addEventListener: (name, cb) => events.set(name, cb), removeEventListener: name => events.delete(name) };
  h.render();
  return h;
}

test('stored recovery waits for fresh load, never overwrites server fields implicitly, and Restore preserves current images', async () => {
  const h = harness();
  writeProductDraft(h.userId, '42', { ...fresh, name: 'Unsaved Adobo', location_ids: [2] });
  const stored = h.values.get(productDraftKey(h.userId, '42'));
  let resolve;
  h.get = path => path.includes('/products/') ? new Promise(done => { resolve = done; }) : Promise.resolve({ data: { data: [] } });
  await h.flush();
  assert.ok(!text(h.tree).includes('Restore draft'));
  assert.equal(h.values.get(productDraftKey(h.userId, '42')), stored);
  resolve({ data: { data: fresh } });
  await h.flush();
  assert.equal(h.field('name').props.value, 'Fresh Adobo');
  assert.equal(h.find(node => node.type === 'fieldset').props.disabled, true);
  h.button('Restore draft').props.onClick();
  await h.flush();
  assert.equal(h.field('name').props.value, 'Unsaved Adobo');
  assert.equal(h.find(node => node.type.name === 'ImageUpload').props.images[0].url, '/fresh.jpg');
  assert.equal(h.find(node => node.type === 'fieldset').props.disabled, false);
  assert.match(text(h.tree), /Images and variants were not restored/);
  h.unmount();
});

test('Discard keeps fresh fields, removes only this draft, and enables editing', async () => {
  const h = harness();
  writeProductDraft(h.userId, '42', { ...fresh, name: 'Old text' });
  await h.flush();
  h.button('Discard draft').props.onClick();
  await h.flush();
  assert.equal(h.field('name').props.value, 'Fresh Adobo');
  assert.equal(readProductDraft(h.userId, '42'), null);
  assert.equal(h.find(node => node.type === 'fieldset').props.disabled, false);
  h.unmount();
});

test('text/selection edits persist immediately; validation and API failure retain recovery; confirmed update clears it', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.values.size, 0, 'initial fresh form must never create/overwrite a draft');
  await h.change('name', 'Unfinished lunch');
  await h.change('featured', true, 'checkbox');
  assert.equal(readProductDraft(h.userId, '42').data.name, 'Unfinished lunch');
  assert.equal(readProductDraft(h.userId, '42').data.featured, true);
  h.find(node => node.props?.id === 'location_2').props.onChange();
  await h.flush();
  h.find(node => node.props?.id === 'collection_5').props.onChange();
  await h.flush();
  assert.deepEqual(readProductDraft(h.userId, '42').data.location_ids, [1, 2]);
  assert.deepEqual(readProductDraft(h.userId, '42').data.collection_ids, [5]);
  await h.change('name', '');
  await h.submit();
  assert.equal(readProductDraft(h.userId, '42').data.name, '');
  await h.change('name', 'Retry lunch');
  h.put = async () => { throw Error('Synthetic API failure'); };
  const previousError = console.error;
  try { console.error = () => {}; await h.submit(); } finally { console.error = previousError; }
  assert.equal(readProductDraft(h.userId, '42').data.name, 'Retry lunch');
  h.put = async () => ({ data: { data: { ...fresh, name: 'Retry lunch' } } });
  await h.submit();
  assert.equal(readProductDraft(h.userId, '42'), null);
  assert.equal(h.field('name').props.value, 'Retry lunch');
  assert.equal(h.events.has('beforeunload'), false);
  h.unmount();
});

test('Back/Cancel use the original list entry; direct editor return replaces safely without looping', async () => {
  const h = harness();
  await h.flush();
  h.button('Back to Products').props.onClick();
  h.button('Cancel').props.onClick();
  assert.deepEqual(h.navigations, [[-1], [-1]]);
  h.location = { search: '?returnTo=https://example.test', state: null };
  await h.flush();
  h.button('Cancel').props.onClick();
  assert.deepEqual(h.navigations.at(-1), ['/admin/products', { replace: true, state: null }]);
  h.unmount();
});

test('successful create clears the new draft and replaces New with Edit while retaining the list return destination', async () => {
  const h = harness(null);
  await h.flush();
  await h.change('name', 'New lunch');
  await h.change('base_price_cents', '12.00');
  await h.change('allow_pickup', false, 'checkbox');
  await h.change('allow_shipping', true, 'checkbox');
  assert.ok(readProductDraft(h.userId, 'new'));
  await h.submit();
  assert.equal(readProductDraft(h.userId, 'new'), null);
  const [path, options] = h.navigations.at(-1);
  assert.equal(path.split('?')[0], '/admin/products/99/edit');
  assert.equal(new URLSearchParams(path.split('?')[1]).get('returnTo'), '/admin/products?q=Adobo&page=3');
  assert.equal(options.replace, true);
  assert.equal(options.state.productListReturn.entryKey, 'products-3');
  h.unmount();
});


test('new editor never writes empty defaults over an existing draft; identity/product changes use distinct component keys', async () => {
  const h = harness(null);
  writeProductDraft(h.userId, 'new', { ...fresh, name: 'Unfinished new dish' });
  const stored = h.values.get(productDraftKey(h.userId, 'new'));
  await h.flush();
  assert.equal(h.field('name').props.value, '');
  assert.equal(h.values.get(productDraftKey(h.userId, 'new')), stored);
  assert.ok(h.button('Restore draft'));
  const key = h.page.key;
  h.id = '43';
  assert.notEqual(Page().key, key);
  h.userId = 'different-owner';
  assert.notEqual(Page().key, key);
  h.unmount();
});

test('Rails decimal weight and nullable stock normalize before draft persistence', async () => {
  const h = harness();
  h.get = async path => ({ data: { data: path.includes('/products/') ? { ...fresh, weight_oz: '8.25', product_stock_quantity: null } : [] } });
  await h.flush();
  await h.change('description', 'Changed lunch details');
  const draft = readProductDraft(h.userId, '42');
  assert.equal(draft.data.weight_oz, 8.25);
  assert.equal(draft.data.product_stock_quantity, undefined);
  assert.match(text(h.tree), /Main form draft saved in this tab/);
  h.unmount();
});


test('storage failure keeps an in-memory navigation draft and honestly warns about browser recovery limits', async () => {
  const h = harness();
  await h.flush();
  globalThis.sessionStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  await h.change('name', 'Keep on this page');
  assert.equal(readProductDraft(h.userId, '42').data.name, 'Keep on this page');
  assert.match(text(h.tree), /Browser recovery is unavailable/);
  let warned = false;
  h.events.get('beforeunload')({ preventDefault() { warned = true; } });
  assert.equal(warned, true);
  h.unmount();
});

test('a late saved response after unmount preserves a newer editor draft and never redirects it', async () => {
  for (const id of ['42', null]) {
    const h = harness(id);
    await h.flush();
    await h.change('name', 'Submitted lunch');
    await h.change('base_price_cents', '12.00');
    if (!id) {
      await h.change('allow_pickup', false, 'checkbox');
      await h.change('allow_shipping', true, 'checkbox');
    }
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    h.put = h.post = async () => { await gate; return { data: { data: fresh } }; };
    const save = h.submit();
    h.unmount();
    writeProductDraft(h.userId, id || 'new', { ...fresh, name: 'Newer lunch after navigation' });
    release();
    await save;
    assert.equal(readProductDraft(h.userId, id || 'new').data.name, 'Newer lunch after navigation');
    assert.deepEqual(h.navigations, []);
  }
});
