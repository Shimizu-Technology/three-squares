import { uiModules, expandUi } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Component event/effect checks with synthetic records. Native modal, keyboard,
// print and viewport acceptance belong to the parent's browser QA.
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const context = 'globalThis.__catalogDialogs';
const mockModal = dataModule('export default function AdminModal() {}');
const hooks = dataModule(['useState', 'useRef', 'useEffect', 'useCallback', 'useLayoutEffect'].map(name => `export const ${name} = (...args) => ${context}.${name}(...args);`).join('\n') + 'export const useId = () => "synthetic-id";');
const auth = dataModule(`const getToken = (...args) => ${context}.getToken(...args); export const useAuth = () => ({ getToken, userId: 'synthetic-user' });`);
const notification = dataModule('export default { success() {}, error() {} }; export const toast = { success() {}, error() {} };');
const baseModules = {
  react: hooks,
  '@clerk/clerk-react': auth,
  'react-hot-toast': notification,
};
async function load(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^(import .+? from )["']([^"']+)["']/gm, (_, prefix, name) => `${prefix}${JSON.stringify(mocks[name] || uiModules[name] || baseModules[name] || import.meta.resolve(name))}`);
  return (await import(dataModule(compiled))).default;
}
const Manager = await load('../src/components/VariantManager.tsx', {
  './admin/AdminModal': mockModal,
  axios: dataModule(`export default { get: (...a) => ${context}.get(...a), patch: (...a) => ${context}.patch(...a) };`),
  '../services/variantPresets': dataModule('export default { getAll: async () => ({ success: true, data: { presets: [] } }) };'),
  '../config': dataModule("export const API_BASE_URL = 'https://synthetic.invalid';"),
});
const Presets = await load('../src/pages/admin/AdminVariantPresetsPage.tsx', {
  '../../components/admin/AdminModal': mockModal,
  '../../services/variantPresets': dataModule(`export const formatPriceAdjustment = () => ''; export default { getAll: async () => ({ success: true, data: { grouped_by_type: {}, option_types: [] } }), create: (...a) => ${context}.create(...a) };`),
});
const Modal = await load('../src/components/admin/AdminModal.tsx', {
  '../ui/Dialog': dataModule('export default function Dialog() {}'),
});
const Migration = await load('../src/pages/admin/AdminShopifyMigration.tsx', {
  '../../components/admin/AdminModal': mockModal,
  '../../services/authApi': dataModule(`export const authGet = (...a) => ${context}.get(...a); export const authPost = async () => ({});`),
});
const Products = await load('../src/pages/admin/AdminProductsPage.tsx', {
  'react-router-dom': dataModule(`export const useLocation = () => ${context}.location; export const useNavigate = () => () => {}; export const useNavigationType = () => 'PUSH';`),
  '../../components/admin/StaffAccess.tsx': dataModule('export const useStaffAccess = () => ({ user: { authorized_locations: [] }, can: () => false });'),
  '../../components/admin/import/menuImportReceipt': dataModule('export const readMenuImportReceipt = () => null;'),
  '../../components/admin/LocalAvailabilityToggle': dataModule('export default function LocalAvailabilityToggle() {}'),
  '../../components/admin/products': dataModule('export function ProductFilters() {} export function ProductsTable() {} export function ProductDetailModal() {}'),
  '../../components/admin/AdminRequestState': dataModule('export default function AdminRequestState() {}'),
  '../../components/admin': dataModule('export function SkeletonListPage() {}'),
  '../../services/authApi': dataModule(`export const authGet = (...args) => ${context}.get(...args); export const authPatch = async () => ({}); export const authPost = async () => ({});`),
  '../../components/admin/products/productQueryState': new URL('../src/components/admin/products/productQueryState.ts', import.meta.url).href,
});
const ProductForm = await load('../src/pages/admin/ProductFormPage.tsx', {
  'react-router-dom': dataModule(`export const useParams = () => ({ id: '42' }); export const useNavigate = () => ${context}.navigate; export const useLocation = () => ${context}.location;`),
  '../../components/admin/StaffAccess.tsx': dataModule('export const useStaffAccess = () => ({ can: () => true, user: { operational_scope: "all", authorized_locations: [] } });'),
  '../../components/ImageUpload': dataModule('export default function ImageUpload() {}'),
  '../../components/VariantManager': dataModule('export default function VariantManager() {}'),
  '../../components/admin/AdminModal': mockModal,
  '../../services/authApi': dataModule(`export const authGet = (...args) => ${context}.get(...args); export const authPut = async () => ({}); export const authPost = async () => ({}); export const authDelete = (...args) => ${context}.remove(...args);`),
  '../../components/admin/products/productDraft': new URL('../src/components/admin/products/productDraft.ts', import.meta.url).href,
  '../../components/admin/products/productQueryState': new URL('../src/components/admin/products/productQueryState.ts', import.meta.url).href,
});
const nodes = raw => { const node = expandUi(raw); return !node || typeof node !== 'object' ? [] : [node,
  ...[node.props?.children, node.props?.footer, node.props?.actions].flat(Infinity).flatMap(nodes)]; };
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const variant = {
  id: 7, sku: 'SYNTHETIC-7', variant_name: 'Test portion', display_name: 'Test portion',
  options: { Portion: 'Test portion' }, size: null, color: null, price_cents: 1200,
  stock_quantity: 8, low_stock_threshold: 0, stock_status: 'in_stock', available: true, actually_available: true,
};
function harness(Component, props = {}) {
  const state = [], effects = [];
  let cursor = 0, tree;
  const h = {
    calls: [], getToken: async () => 'synthetic',
    get: async () => ({ data: { data: [variant] } }),
    patch: async (...args) => { h.calls.push(args); return { data: { data: variant } }; },
    create: async (...args) => { h.calls.push(args); return {}; },
    useState(initial) { const key = cursor++; if (!(key in state)) state[key] = typeof initial === 'function' ? initial() : initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useCallback(callback, deps) { const key = cursor++; if (!state[key] || deps.some((value, index) => !Object.is(value, state[key].deps[index]))) state[key] = { callback, deps }; return state[key].callback; },
    useLayoutEffect(effect, deps) { return h.useEffect(effect, deps); },
    useRef(initial) { const key = cursor++; return state[key] ||= { current: initial }; },
    useEffect(effect, deps) { const key = cursor++; if (!state[key] || deps.some((value, index) => !Object.is(value, state[key].deps[index]))) { effects.push(() => { state[key]?.cleanup?.(); state[key] = { deps, cleanup: effect() }; }); } },
    async flush() { for (let i = 0; i < 8; i++) { globalThis.__catalogDialogs = h; cursor = 0; tree = Component(props); effects.splice(0).forEach(effect => effect()); await Promise.resolve(); } },
    find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control'); return node; },
    button(label) { return h.find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label)).props; },
    field(id) { return h.find(node => node.type === 'input' && node.props.id === id).props; },
    modal() { return h.find(node => node.type?.name === 'AdminModal').props; },
    unmount() { state.forEach(value => value?.cleanup?.()); },
    get tree() { return tree; },
  };
  return h;
}
const manager = canManageStock => harness(Manager, { productId: 42, basePriceCents: 1200, inventoryLevel: 'variant', canManageStock });

test('AdminModal names the shared dialog, blocks all close requests while pending and limits print styles to an open modal', () => {
  let closes = 0;
  const h = harness(Modal);
  globalThis.__catalogDialogs = h;
  const panel = Modal({ open: true, title: 'Synthetic editor', subtitle: 'Short help', dismissible: false, onClose: () => closes++, children: 'Content' });
  assert.equal(panel.type.name, 'Dialog');
  assert.equal(panel.props.dismissible, false);
  assert.equal(panel.props.labelledBy, nodes(panel).find(node => node.type === 'h2').props.id);
  assert.equal(panel.props.describedBy, nodes(panel).find(node => node.type === 'p').props.id);
  panel.props.onOpenChange(false);
  const close = nodes(panel).find(node => node.type === 'button');
  assert.equal(close.props.disabled, true);
  assert.equal(close.props['aria-label'], 'Close Synthetic editor');
  close.props.onClick();
  assert.equal(closes, 0);
  const closed = Modal({ open: false, printable: true, title: 'Synthetic print', onClose() {}, children: 'Content' });
  assert.equal(nodes(closed).some(node => node.type === 'style'), false);
});

test('variant pending state rejects duplicate saves and every dismissal, then preserves failed edits and capability-specific payloads', async () => {
  for (const canManageStock of [false, true]) {
    const h = manager(canManageStock), pending = deferred(), opener = {};
    h.patch = async (...args) => { h.calls.push(args); return pending.promise; };
    await h.flush();
    h.button('Edit Test portion').onClick({ currentTarget: opener });
    await h.flush();
    h.field('variant-edit-price').onChange({ target: { value: '15.00' } });
    await h.flush();
    const save = h.button('Save Changes').onClick;
    const first = save();
    await save();
    h.modal().onClose(); // stale callback before React commits pending state
    await h.flush();
    assert.equal(h.modal().open, true);
    assert.equal(h.modal().dismissible, false);
    assert.equal(h.modal().returnFocusRef.current, opener);
    assert.equal(h.button('Cancel').disabled, true);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0][1], { product_variant: { price_cents: 1500, ...(canManageStock ? { stock_quantity: 8, low_stock_threshold: 0 } : {}), available: true } });
    pending.reject({ response: { data: { error: 'Synthetic save failure' } } });
    await first;
    await h.flush();
    assert.equal(h.modal().open, true);
    assert.equal(h.modal().dismissible, true);
    assert.equal(h.field('variant-edit-price').value, '15.00');
    assert.match(text(h.tree), /Synthetic save failure/);
    h.modal().onClose();
    await h.flush();
    assert.equal(h.modal().open, false);
    h.unmount();
  }
});

test('variant deadline releases the save guard and prevents a late token from sending a request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = manager(true), token = deferred();
  await h.flush();
  h.button('Edit Test portion').onClick({ currentTarget: {} });
  await h.flush();
  h.getToken = () => token.promise;
  const saving = h.button('Save Changes').onClick();
  t.mock.timers.tick(20_000);
  await saving;
  await h.flush();
  assert.equal(h.modal().dismissible, true);
  assert.equal(h.modal().open, true);
  assert.match(text(h.tree), /timed out/);
  assert.equal(h.field('variant-edit-price').value, '12.00');
  token.resolve('late-synthetic');
  await h.flush();
  assert.equal(h.calls.length, 0);
  h.unmount();
});

test('variant timeout aborts an in-flight request and ignores its late success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = manager(true), response = deferred();
  h.patch = async (...args) => { h.calls.push(args); return response.promise; };
  await h.flush();
  h.button('Edit Test portion').onClick({ currentTarget: {} });
  await h.flush();
  const saving = h.button('Save Changes').onClick();
  await h.flush();
  t.mock.timers.tick(20_000);
  await saving;
  assert.equal(h.calls[0][2].signal.aborted, true);
  response.resolve({ data: { data: { ...variant, price_cents: 9900 } } });
  await h.flush();
  assert.equal(h.modal().open, true);
  assert.equal(h.field('variant-edit-price').value, '12.00');
  assert.doesNotMatch(text(h.find(node => node.type === 'table')), /\$99\.00/);
  h.unmount();
});

test('preset save blocks dismissal and duplicate submissions, retaining the draft on failure', async () => {
  const h = harness(Presets), response = deferred();
  h.create = async (...args) => { h.calls.push(args); return response.promise; };
  await h.flush();
  h.button('New Preset').onClick();
  await h.flush();
  h.field('preset-name').onChange({ target: { value: 'Synthetic preset' } });
  h.field('preset-option-type').onChange({ target: { value: 'Portion' } });
  h.find(node => node.props?.['aria-label'] === 'New value name').props.onChange({ target: { value: 'Synthetic portion' } });
  await h.flush();
  h.button('Add').onClick();
  await h.flush();
  const save = h.button('Create Preset').onClick;
  const saving = save();
  await save();
  h.modal().onClose();
  await h.flush();
  assert.equal(h.modal().open, true);
  assert.equal(h.modal().dismissible, false);
  assert.equal(h.calls.length, 1);
  response.reject(new Error('Synthetic preset failure'));
  await saving;
  await h.flush();
  assert.equal(h.modal().dismissible, true);
  assert.equal(h.field('preset-name').value, 'Synthetic preset');
  assert.match(text(h.tree), /Synthetic portion/);
  h.unmount();
});

test('closing import details keeps the active import polling until terminal status', async t => {
  const imp = { id: 1, filename: 'synthetic.csv', status: 'processing', total_products: 10, processed_products: 2, progress_percent: 20, products_count: 2, warnings: [], user: { name: 'Synthetic Operator', email: 'operator@example.invalid' } };
  const h = harness(Migration), intervals = new Map();
  let nextId = 0;
  t.mock.method(globalThis, 'setInterval', callback => { const id = ++nextId; intervals.set(id, callback); return id; });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  h.get = async path => { h.calls.push(path); return { data: { data: path === '/admin/imports' ? [imp] : imp } }; };
  await h.flush();
  const opener = {};
  await h.button('View Details').onClick({ currentTarget: opener });
  await h.flush();
  assert.equal(h.modal().open, true);
  assert.equal(h.modal().returnFocusRef.current, opener);
  h.modal().onClose();
  await h.flush();
  assert.equal(h.modal().open, false);
  assert.equal(intervals.size, 1);
  [...intervals.values()][0]();
  await h.flush();
  assert.equal(h.calls.filter(path => path === '/admin/imports/1').length, 2);
  imp.status = 'completed';
  [...intervals.values()][0]();
  await h.flush();
  assert.equal(intervals.size, 0);
  assert.equal(h.modal().open, false);
  h.unmount();
});

test('async product details retain the actual row opener captured before awaiting the response', async t => {
  const previous = { Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, document: globalThis.document, window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  class SyntheticElement { closest() { return this; } }
  globalThis.Element = SyntheticElement;
  globalThis.HTMLElement = SyntheticElement;
  const opener = new SyntheticElement(), unrelated = new SyntheticElement();
  globalThis.document = { activeElement: unrelated };
  const h = harness(Products), response = deferred();
  h.location = { pathname: '/admin/products', search: '', key: 'synthetic-entry', state: null };
  globalThis.window = { location: h.location, scrollY: 0, history: { state: { idx: 1 } }, addEventListener() {}, removeEventListener() {}, scrollTo() {} };
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  const product = { id: 42, slug: 'synthetic-item', name: 'Synthetic item', published: true, archived: false, base_price_cents: 1200 };
  h.get = async path => path === '/admin/products' ? { data: { data: [product] } } : response.promise;
  await h.flush();
  h.tree.props.onClickCapture({ target: opener });
  const loading = h.find(node => node.type?.name === 'ProductsTable').props.onView(product);
  // A different control gains focus during the request.
  globalThis.document.activeElement = unrelated;
  response.resolve({ data: { data: { ...product, variants: [], collections: [], images: [] } } });
  await loading;
  await h.flush();
  const detail = h.find(node => node.type?.name === 'ProductDetailModal').props;
  assert.equal(detail.returnFocusRef.current, opener);
  detail.onClose();
  await h.flush();
  assert.equal(nodes(h.tree).some(node => node.type?.name === 'ProductDetailModal'), false);
  h.unmount();
});

test('archive pending blocks close and duplicate submits; failure retains the product draft and confirmation', async t => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.window = { history: { state: { idx: 1 } }, addEventListener() {}, removeEventListener() {} };
  const h = harness(() => { const page = ProductForm(); return page.type(page.props); });
  h.location = { search: '?returnTo=%2Fadmin%2Fproducts', state: null };
  h.navigate = (...args) => h.calls.push(args);
  h.get = async path => ({ data: { data: path.includes('/products/') ? { id: 42, name: 'Synthetic catalog item', base_price_cents: 1200, allow_pickup: true, allow_shipping: false, location_ids: [1], inventory_level: 'none' } : [] } });
  const response = deferred();
  h.remove = async (...args) => { h.calls.push(args); return response.promise; };
  await h.flush();
  const name = h.find(node => node.props?.name === 'name').props;
  name.onChange({ target: { name: 'name', value: 'Synthetic unsaved name', type: 'text' } });
  await h.flush();
  const draft = [...values.values()][0];
  h.button('Archive').onClick();
  await h.flush();
  const save = h.button('Archive Product').onClick;
  const saving = save();
  await save();
  h.modal().onClose();
  await h.flush();
  assert.equal(h.modal().open, true);
  assert.equal(h.modal().dismissible, false);
  assert.equal(h.calls.length, 1);
  response.reject(new Error('Synthetic archive failure'));
  await saving;
  await h.flush();
  assert.equal(h.modal().open, true);
  assert.equal(h.modal().dismissible, true);
  assert.equal(h.find(node => node.props?.name === 'name').props.value, 'Synthetic unsaved name');
  assert.equal([...values.values()][0], draft);
  h.modal().onClose();
  await h.flush();
  assert.equal(h.modal().open, false);
  h.unmount();
});
