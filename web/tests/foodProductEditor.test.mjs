import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { readProductDraft } from '../src/components/admin/products/productDraft.ts';

// Exercise editor event/effect boundaries with deterministic hooks and API promises.
// This is deliberately not browser acceptance: native validation, layout and scroll remain parent QA.
const mockModule = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const context = 'globalThis.__foodProductEditor';
const imports = {
  react: mockModule(`export const useState = (...a) => ${context}.useState(...a); export const useRef = (...a) => ${context}.useRef(...a); export const useEffect = (...a) => ${context}.useEffect(...a);`),
  'react-router-dom': mockModule(`export const useParams = () => ({ id: ${context}.id }); export const useNavigate = () => ${context}.navigate; export const useLocation = () => ${context}.location;`),
  '@clerk/clerk-react': mockModule(`export const useAuth = () => ({ userId: ${context}.userId, getToken: async () => 'synthetic' });`),
  'react-hot-toast': mockModule('export default { success() {}, error() {} };'),
  '../../components/admin/StaffAccess.tsx': mockModule("export const useStaffAccess = () => ({ can: () => globalThis.__foodProductEditor.canManageStock, user: { operational_scope: 'all', authorized_locations: [{id:1},{id:2}] } });"),
  '../../components/admin/LocationOfferingEditor': mockModule('export default function LocationOfferingEditor() { return null; }'),
  '../../components/ImageUpload': mockModule('export default function ImageUpload() { return null; }'),
  '../../components/VariantManager': mockModule('export default function VariantManager() { return null; }'),
  '../../components/admin/AdminModal': mockModule('export default function AdminModal() {}'),
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
function harness(product = fresh, id = '42', canManageStock = true) {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = [], pending = [], events = new Map(), navigations = [];
  let cursor = 0, tree, page;
  const h = {
    id, canManageStock, requests: [], userId: `editor-test-${++sequence}`, values, events, navigations,
    location: { search: `?${new URLSearchParams({ returnTo: '/admin/products?q=Adobo&page=3' })}`, state: { productListReturn: { path: '/admin/products?q=Adobo&page=3', entryKey: 'products-3', index: 4 } } },
    navigate: (...args) => navigations.push(args),
    get: async path => ({ data: { data: path.includes('/products/') ? product : path === '/admin/locations' ? [{ id: 1, name: 'Main', active: true }, { id: 2, name: 'Donki', active: true }] : [{ id: 5, name: 'Lunch' }] } }),
    put: async (_path, payload) => { h.requests.push(payload); return { data: { data: { ...product, ...payload.product } } }; },
    post: async (_path, payload) => { h.requests.push(payload); return { data: { data: { ...product, ...payload.product, id: 99 } } }; },
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
      globalThis.__foodProductEditor = h;
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

const typeOptions = h => nodes(h.field('product_type')).filter(node => node.type === 'option');
const shippingDisclosure = h => h.find(node => node.type === 'details' && text(node).includes('Advanced shipping'));
// Exercise the input's custom-validity callback. Native UI/focus stays with parent QA.
const weightValidation = field => {
  let message;
  field.props.ref({ setCustomValidity(value) { message = value; }, focus() {} });
  return message;
};

test('new dishes default to local with explicit food/seed choices and no unrelated Apparel option', async () => {
  const h = harness(fresh, null);
  await h.flush();
  assert.equal(h.field('product_type').props.value, 'local');
  assert.deepEqual(typeOptions(h).map(node => node.props.value), ['local', 'shippable', 'retail', 'market_price', 'quote_only', 'complimentary_with_meal']);
  assert.equal(shippingDisclosure(h).props.open, false);
  assert.equal(h.field('weight_oz').props.required, false);
  h.unmount();
});

test('seed, legacy and custom saved types have truthful options and survive an unrelated save', async () => {
  for (const type of ['local', 'shippable', 'retail', 'market_price', 'quote_only', 'complimentary_with_meal', 'apparel', 'hats', 'Chef special 🥥', '']) {
    const product = { ...fresh, product_type: type, vendor: '', inventory_level: 'product', product_stock_quantity: 0, product_low_stock_threshold: 0 };
    const h = harness(product);
    await h.flush();
    const selected = typeOptions(h).filter(option => option.props.value === h.field('product_type').props.value);
    assert.equal(selected.length, 1, `matching option for ${type}`);
    if (type === 'local') assert.equal(text(selected[0]), 'Local menu item');
    if (['apparel', 'hats', 'Chef special 🥥', ''].includes(type)) assert.match(text(selected[0]), /saved type/);
    assert.equal(h.field('product_stock_quantity').props.value, 0);
    assert.equal(h.field('product_low_stock_threshold').props.value, 0);
    await h.change('description', 'Lunch details updated');
    await h.submit();
    const { id: _id, images: _images, location_ids: _separatelySavedLocations, ...expected } = product;
    assert.deepEqual(h.requests[0].product, { ...expected, description: 'Lunch details updated' });
    assert.equal(h.field('product_type').props.value, type);
    h.unmount();
  }
});

test('pickup-only zero weight is optional; shipping requires positive weight and preserves known weights', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.field('weight_oz').props.value, 0);
  assert.equal(weightValidation(h.field('weight_oz')), '');
  await h.change('description', 'Pickup at Main');
  await h.submit();
  assert.equal(h.requests[0].product.weight_oz, 0, 'backend normalizes unset pickup weight');
  await h.change('allow_shipping', true, 'checkbox');
  assert.equal(shippingDisclosure(h).props.open, true);
  assert.equal(h.field('weight_oz').props.required, true);
  assert.match(weightValidation(h.field('weight_oz')), /greater than zero/);
  await h.change('weight_oz', '0');
  assert.match(weightValidation(h.field('weight_oz')), /greater than zero/);
  await h.change('weight_oz', '-1');
  assert.match(weightValidation(h.field('weight_oz')), /greater than zero/);
  await h.change('weight_oz', '0.025');
  assert.equal(weightValidation(h.field('weight_oz')), '', 'any positive known weight is accepted');
  assert.equal(h.field('weight_oz').props.step, 'any');
  await h.change('allow_shipping', false, 'checkbox');
  assert.equal(h.field('weight_oz').props.value, 0.025);
  assert.equal(h.field('weight_oz').props.required, false);
  assert.equal(weightValidation(h.field('weight_oz')), '');
  await h.submit();
  assert.equal(h.requests.at(-1).product.weight_oz, 0.025);
  h.unmount();
});

test('zero-priced quote, market and complimentary items save without a fabricated price', async () => {
  for (const type of ['market_price', 'quote_only', 'complimentary_with_meal']) {
    const h = harness({ ...fresh, product_type: type, base_price_cents: 0 });
    await h.flush();
    await h.change('description', 'Updated food description');
    await h.submit();
    assert.equal(h.requests.length, 1, type);
    assert.equal(h.requests[0].product.base_price_cents, 0);
    assert.equal(h.requests[0].product.product_type, type);
    h.unmount();
  }
  const h = harness({ ...fresh, base_price_cents: 0 });
  await h.flush();
  await h.submit();
  assert.equal(h.requests.length, 0, 'ordinary local items still require a price');
  h.unmount();
});

test('scoped managers keep stock read only and main saves omit protected inventory fields', async () => {
  const h = harness({ ...fresh, inventory_level: 'product', product_stock_quantity: 7 }, '42', false);
  await h.flush();
  const inventory = h.find(node => node.type === 'fieldset' && node.props.className.includes('bg-white') && text(node).includes('Shared stock is read only'));
  assert.equal(inventory.props.disabled, true);
  assert.equal(h.find(node => node.type.name === 'VariantManager').props.canManageStock, false);
  await h.change('description', 'Only food description changes');
  await h.submit();
  for (const key of ['inventory_level', 'product_stock_quantity', 'product_low_stock_threshold']) assert.equal(key in h.requests[0].product, false);
  assert.equal(h.requests[0].product.product_type, 'local');
  assert.equal(readProductDraft(h.userId, '42'), null);
  h.unmount();
});

test('submitting collapsed invalid shipping opens the section, focuses weight and sends no request', async () => {
  const h = harness({ ...fresh, allow_shipping: true, weight_oz: 0 });
  await h.flush();
  const disclosure = { open: false };
  let focused = false;
  shippingDisclosure(h).props.ref.current = disclosure;
  h.field('weight_oz').props.ref({ setCustomValidity() {}, focus() { focused = true; } });
  await h.submit();
  assert.equal(h.requests.length, 0);
  assert.equal(disclosure.open, true);
  assert.equal(focused, true);
  assert.equal(h.field('weight_oz').props['aria-invalid'], true);
  assert.ok(nodes(h.tree).some(node => node.props?.role === 'alert' && text(node).includes('Shipping weight must be greater than zero.')));
  h.unmount();
});
