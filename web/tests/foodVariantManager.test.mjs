import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const context = 'globalThis.__foodVariants';
const imports = {
  react: moduleUrl(`export const useState = (...a) => ${context}.useState(...a); export const useRef = (...a) => ${context}.useRef(...a); export const useEffect = (...a) => ${context}.useEffect(...a);`),
  '@clerk/clerk-react': moduleUrl("export const useAuth = () => ({ getToken: async () => 'synthetic' });"),
  axios: moduleUrl(`export default { get: (...a) => ${context}.get(...a), patch: (...a) => ${context}.patch(...a) };`),
  'react-hot-toast': moduleUrl('export default { success() {}, error() {} };'),
  './admin/AdminModal': moduleUrl('export default function AdminModal() {}'),
  '../services/variantPresets': moduleUrl('export default { getAll: async () => ({ success: true, data: { presets: [] } }) };'),
  '../config': moduleUrl("export const API_BASE_URL = 'https://synthetic.invalid';"),
};
const source = readFileSync(new URL('../src/components/VariantManager.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^(import .+? from )["']([^"']+)["']/gm, (_, prefix, name) => `${prefix}${JSON.stringify(imports[name] || import.meta.resolve(name))}`);
const { default: Manager } = await import(moduleUrl(compiled));
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children, node.props?.footer].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const cookieBox = Object.freeze({
  id: 11, sku: 'COOKIE-6-COCONUT', variant_name: 'Box of 6 / Coconut', display_name: 'Box of 6 / Coconut',
  options: Object.freeze({ 'Box size': '6 cookies', Flavor: 'Coconut' }), size: 'Six', color: null,
  price_cents: 1200, stock_quantity: 8, low_stock_threshold: 0, stock_status: 'in_stock',
  available: true, actually_available: true,
});

function harness(canManageStock = false) {
  const state = [], effects = [];
  let cursor = 0, tree;
  const h = {
    requests: [],
    get: async () => ({ data: { data: [cookieBox] } }),
    patch: async (_path, payload) => {
      h.requests.push(payload);
      return { data: { data: { ...cookieBox, ...payload.product_variant } } };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], update => { state[index] = typeof update === 'function' ? update(state[index]) : update; }];
    },
    useRef(initial) { const index = cursor++; return state[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!state[index] || deps.some((value, i) => !Object.is(value, state[index][i]))) {
        state[index] = deps;
        effects.push(effect);
      }
    },
    async flush() {
      for (let i = 0; i < 6; i++) {
        globalThis.__foodVariants = h;
        cursor = 0;
        tree = Manager({ productId: 42, basePriceCents: 1200, inventoryLevel: 'variant', canManageStock });
        effects.splice(0).forEach(effect => effect());
        await Promise.resolve();
      }
    },
    find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected variant control'); return node; },
    button(label) { return h.find(node => node.type === 'button' && text(node).trim() === label); },
    get tree() { return tree; },
  };
  return h;
}

test('existing cookie choices remain visible while SKU and generation stay inside native disclosures', async () => {
  const h = harness();
  await h.flush();
  const table = h.find(node => node.type === 'table');
  assert.match(text(table), /Box of 6 \/ Coconut/);
  assert.match(text(table), /\$12.00/);
  const sku = nodes(table).find(node => node.type === 'details');
  assert.match(text(sku), /COOKIE-6-COCONUT/);
  assert.notEqual(sku.props.open, true);
  const generator = h.find(node => node.type === 'details' && text(node).includes('Generate Variants'));
  assert.notEqual(generator.props.open, true);
  assert.equal(nodes(generator).includes(table), false);
  assert.ok(h.button('Edit'));
  assert.deepEqual(cookieBox.options, { 'Box size': '6 cookies', Flavor: 'Coconut' }, 'legacy extraction must not mutate saved options');
  assert.equal(h.requests.length, 0, 'viewing never rewrites existing variants');
  for (const button of nodes(h.tree).filter(node => node.type === 'button')) assert.equal(button.props.type, 'button');
});

test('adding a food option with Enter consumes the key instead of submitting the parent product form', async () => {
  const h = harness();
  await h.flush();
  let field = h.find(node => node.props?.['aria-label'] === 'New option type');
  field.props.onChange({ target: { value: 'Portion' } });
  await h.flush();
  field = h.find(node => node.props?.['aria-label'] === 'New option type');
  let prevented = false;
  field.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  await h.flush();
  assert.equal(prevented, true);
  assert.ok(h.find(node => node.props?.['aria-label'] === 'New Portion value'));
  assert.equal(h.requests.length, 0);
});

test('editing a variant price preserves options and omits protected stock for scoped managers', async () => {
  const h = harness(false);
  await h.flush();
  h.button('Edit').props.onClick();
  await h.flush();
  const inputs = nodes(h.tree).filter(node => node.type === 'input' && node.props.type === 'number');
  assert.equal(inputs[1].props.disabled, true);
  assert.equal(inputs[2].props.disabled, true);
  inputs[0].props.onChange({ target: { value: '14.25' } });
  await h.flush();
  await h.button('Save Changes').props.onClick();
  await h.flush();
  assert.deepEqual(h.requests, [{ product_variant: { price_cents: 1425, available: true } }]);
  assert.match(text(h.find(node => node.type === 'table')), /\$14.25/);
  assert.match(text(h.tree), /Box of 6 \/ Coconut/);
  assert.match(text(h.tree), /COOKIE-6-COCONUT/);
});
