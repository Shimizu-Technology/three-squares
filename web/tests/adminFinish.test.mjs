import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { uiModules, expandUi } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Deterministic component event/effect checks; real API and viewport QA belongs to integration.
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const ctx = 'globalThis.__adminFinish';
const stubs = names => url(names.map(name => `export function ${name}() { return null; }`).join('\n'));
const mocks = {
  '../components/admin/OnlineOrderingSection': url('export default function OnlineOrderingSection() {}'),
  react: url(['useState', 'useEffect', 'useCallback', 'useRef'].map(name => `export const ${name} = (...args) => ${ctx}.${name}(...args);`).join('\n')),
  '@clerk/clerk-react': url(`export const useAuth = () => ({ getToken: ${ctx}.getToken });`),
  'react-router-dom': url(`export function Link() {}\nexport const useNavigate = () => () => {};\nexport const useSearchParams = () => [new URLSearchParams(), () => {}];`),
  'lucide-react': stubs(['TrendingUp', 'TrendingDown', 'Minus', 'ShoppingCart', 'DollarSign', 'Clock', 'Package', 'Plus', 'ClipboardList', 'FolderOpen', 'Settings', 'BarChart3', 'ArrowRight', 'Eye', 'Edit', 'MoreVertical', 'Archive', 'ArchiveRestore', 'Copy', 'Globe', 'GlobeLock', 'ArrowUpDown', 'AlertTriangle']),
  recharts: stubs(['BarChart', 'Bar', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'ResponsiveContainer']),
  '../../components/admin': stubs(['SkeletonBar', 'SkeletonStatCard', 'StatCard', 'SkeletonDashboard']),
  '../../components/admin/AdminRequestState': url('export default function RequestState() {}'),
  '../../components/admin/StaffAccess.tsx': url(`export const useStaffAccess = () => ${ctx}.access;`),
  '../../services/authApi': url(`export const authGet = (...args) => ${ctx}.get(...args);`),
  axios: url(`export default { get: (...args) => ${ctx}.get(...args), put: (...args) => ${ctx}.put(...args), isAxiosError: () => false };`),
  'react-hot-toast': url(`export default { success: (...args) => ${ctx}.toasts.push(args), error: (...args) => ${ctx}.toasts.push(args) };`),
  '../services/api': url('export default {}; export const collectionsApi = {};'),
  '../hooks/useAppConfig': url(`export const invalidateAppConfig = () => ${ctx}.invalidations++;`),
  '../components/payment/PaymentStatusPanel': url('export default function PaymentStatusPanel() {}'),
  './PaymentEnvironmentBadge': url('export default function PaymentEnvironmentBadge() {}'),
  '../config': url('export const API_BASE_URL = "https://api.example.test";'),
  '../constants/announcementStyles': url('export const ANNOUNCEMENT_STYLE_HEX = { gold: "#123456" };'),
  './productUtils': url('export const formatCurrency = value => `$${value / 100}`; export const getStockDisplay = () => ({ value: 5, color: "", tooltip: "" });'),
  '../../ui/PlaceholderImage': url('export default function PlaceholderImage() {}'),
};
async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(mocks[name] || uiModules[name] || import.meta.resolve(name))}`);
  return (await import(url(code))).default;
}
const Analytics = await load('../src/pages/admin/AdminAnalyticsPage.tsx');
const Dashboard = await load('../src/pages/admin/AdminDashboardPage.tsx');
const Settings = await load('../src/pages/AdminSettingsPage.tsx');
const PaymentsPanel = await load('../src/components/payment/PaymentStatusPanel.tsx');
const Products = await load('../src/components/admin/products/ProductsTable.tsx');
const nodes = raw => { const node = expandUi(raw); return !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children, node.props?.actions].flat(Infinity).flatMap(nodes)]; };
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node && typeof node !== 'boolean' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const initialSettings = {
  store_name: 'Synthetic store', store_email: 'store@example.test', store_phone: '555-0100',
  shipping_origin_address: { company: 'Synthetic store', street1: '1 Example Street', city: 'Example', state: 'GU', zip: '96900', country: 'US', phone: '555-0100' },
  announcement_enabled: false, announcement_text: 'Saved banner', announcement_style: 'gold',
  send_retail_emails: false, send_wholesale_emails: false,
  enable_storefront_three_squares: false, enable_storefront_latte_stone: false, enable_storefront_catering: false, enable_catering_online_ordering: false,
};
const chart = (current = 3, previous = 0) => ({ series: [{ date: '2026-10-27', label: 'Oct 27', orders: 3, revenue_cents: 600 }], comparison: { this_week: { orders: current, revenue_cents: current * 200 }, last_week: { orders: previous, revenue_cents: previous * 200 } } });
function harness(t, Component, props = {}) {
  const hooks = [], effects = [];
  let cursor = 0, tree;
  const h = {
    props, calls: [], toasts: [], invalidations: 0, writes: 0, access: { scopeLabel: 'Assigned location' }, getToken: async () => 'synthetic-token',
    get: async path => ({ data: path.endsWith('/settings') ? { settings: structuredClone(initialSettings) } : structuredClone(initialSettings) }),
    put: async (path, body) => ({ data: path.endsWith('/settings') ? { settings: body.settings } : body.site_setting }),
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], next => { h.writes++; hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
    useRef(initial) { return hooks[cursor++] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index].deps[i]))) hooks[index] = { fn, deps }; return hooks[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index].deps[i]))) effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: fn() }; }); },
    render() { globalThis.__adminFinish = h; cursor = 0; tree = Component(h.props); },
    async flush() { for (let i = 0; i < 20; i++) { h.render(); for (const effect of effects.splice(0)) effect(); await Promise.resolve(); } },
    find(predicate, root = tree) { const node = nodes(root).find(predicate); assert.ok(node, 'Expected component/control'); return node; },
    button(label, root = tree) { return h.find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label), root); },
    click(label, root = tree) { return h.button(label, root).props.onClick(); },
    general() { const node = h.find(node => node.type?.name === 'GeneralSettingsTab'); return node.type(node.props); },
    generalProps() { return h.find(node => node.type?.name === 'GeneralSettingsTab').props; },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
    get tree() { return tree; },
  };
  globalThis.__adminFinish = h;
  t.after(() => h.unmount());
  return h;
}

for (const [current, previous, expected] of [[0, 0, 'No activity in either week'], [3, 0, 'New activity this week · None last week'], [3, 2, '+50% vs last week'], [1, 2, '-50% vs last week'], [2, 2, '0% vs last week']]) {
  test(`weekly comparison ${current}/${previous} is honest and separate from daily controls`, async t => {
    const h = harness(t, Analytics); h.get = async () => ({ data: chart(current, previous) }); await h.flush();
    const week = h.find(node => node.props?.['aria-labelledby'] === 'weekly-summary-title');
    assert.match(text(week), /This week so far vs last week/);
    for (const comparison of nodes(week).filter(node => node.type?.name === 'WeekComparison')) assert.equal(text(comparison.type(comparison.props)), expected);
    assert.equal(nodes(week).some(node => node.type === 'button'), false);
    assert.match(text(h.tree), /Assigned location · All business lines · Production, non-simulated orders/);
    assert.match(text(h.tree), /Revenue is captured sales minus succeeded refunds/);
    const daily = h.find(node => node.props?.['aria-labelledby'] === 'daily-chart-title');
    for (const label of ['Last 7 days', 'Last 14 days', 'Last 30 days', 'Revenue', 'Orders']) assert.match(h.button(label, daily).props.className, /min-h-\[44px\]/);
    assert.equal(h.button('Revenue').props['aria-pressed'], true); h.click('Orders'); await h.flush(); assert.equal(h.button('Orders').props['aria-pressed'], true);
    assert.equal(h.find(node => node.type?.name === 'Bar').props.isAnimationActive, false);
    for (const axis of nodes(h.tree).filter(node => ['XAxis', 'YAxis'].includes(node.type?.name))) assert.equal(axis.props.tick.fill, '#4b5563');
  });
}

test('range changes hide old data; late requests cannot overwrite newer range; refresh errors retain data', async t => {
  const h = harness(t, Analytics); h.get = async () => ({ data: chart() }); await h.flush();
  const old = deferred(), latest = deferred();
  h.get = (_, __, options) => options.params.days === 7 ? old.promise : latest.promise;
  h.click('Last 7 days'); await h.flush(); assert.equal(nodes(h.tree).some(node => node.type?.name === 'Bar'), false);
  h.click('Last 30 days'); await h.flush(); latest.resolve({ data: chart(9, 3) }); await h.flush();
  old.resolve({ data: chart(1, 0) }); await h.flush();
  assert.equal(h.find(node => node.type?.name === 'WeekComparison').props.current, 1800);
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  h.get = async () => { throw Error('Synthetic offline'); }; h.click('Refresh analytics'); await h.flush();
  const request = h.find(node => node.type?.name === 'RequestState'); assert.equal(request.props.error, true); assert.equal(request.props.hasData, true);
  assert.equal(h.button('Last 30 days').props['aria-pressed'], true);
});

test('zero daily series has a range- and measure-specific empty state with usable controls', async t => {
  const h = harness(t, Analytics);
  h.get = async (_, __, options) => ({ data: { ...chart(0, 0), series: Array.from({ length: options.params.days }, () => ({ orders: 0, revenue_cents: 0 })) } });
  await h.flush();
  for (const days of [7, 14, 30]) {
    h.click(`Last ${days} days`); await h.flush();
    for (const [label, phrase] of [['Revenue', 'net revenue'], ['Orders', 'orders']]) {
      h.click(label); await h.flush();
      assert.match(text(h.tree), new RegExp(`No production ${phrase} in the last ${days} days`));
      assert.equal(nodes(h.tree).some(node => node.type?.name === 'BarChart'), false);
      assert.equal(h.button(label).props['aria-pressed'], true);
      assert.equal(h.button(`Last ${days} days`).props['aria-pressed'], true);
    }
  }
});

for (const values of [[1], [50, 75], [-1234, 100], [12500, 44000]]) {
  test(`nonzero daily values ${values} have distinct cent and integer labels and an inclusive domain`, async t => {
    const h = harness(t, Analytics);
    h.get = async () => ({ data: { ...chart(), series: values.map(value => ({ orders: Math.abs(value), revenue_cents: value })) } });
    await h.flush();
    for (const mode of ['Revenue', 'Orders']) {
      h.click(mode); await h.flush();
      const axis = h.find(node => node.type?.name === 'YAxis').props;
      const labels = axis.ticks.map(axis.tickFormatter ?? String);
      assert.equal(new Set(labels).size, labels.length);
      assert.ok(axis.ticks.every(Number.isInteger));
      const displayed = mode === 'Revenue' ? values : values.map(Math.abs);
      assert.ok(axis.domain[0] <= Math.min(0, ...displayed));
      assert.ok(axis.domain[1] >= Math.max(0, ...displayed));
      assert.equal(nodes(h.tree).some(node => text(node).includes('No production net revenue')), false);
    }
  });
}

test('dashboard describes scoped all-time production orders and global published products', async t => {
  const h = harness(t, Dashboard); h.access.scopeLabel = 'All locations';
  h.get = async path => ({ data: path.endsWith('/stats') ? { total_orders: 5, total_revenue_cents: 1000, pending_orders: 1, total_products: 12 } : { orders: [] } });
  await h.flush(); assert.match(text(h.tree), /All-time order totals · All locations · All business lines/);
  assert.match(text(h.tree), /Production, non-simulated orders only/);
  assert.match(text(h.tree), /Revenue is captured sales minus succeeded refunds/);
  assert.ok(nodes(h.tree).some(node => node.props?.label === 'All-time net revenue'));
  assert.ok(nodes(h.tree).some(node => node.props?.label === 'Published products (global)' && node.props.value === 12));
  assert.match(text(h.tree), /Includes test and simulated orders/);
});

test('banner is a named draft switch and only Save changes persists it', async t => {
  const h = harness(t, Settings); h.put = async (...args) => { h.calls.push(args); return { data: { ...initialSettings, ...args[1].site_setting } }; }; await h.flush();
  const banner = h.button('Enable Banner', h.general()); assert.equal(banner.props.role, 'switch'); assert.equal(banner.props['aria-checked'], false); assert.equal(banner.props['data-ui-control'], 'switch');
  h.click('Enable Banner', h.general()); await h.flush(); assert.equal(h.calls.length, 0); assert.equal(h.button('Enable Banner', h.general()).props['aria-checked'], true);
  assert.match(text(h.general()), /Banner changes apply when you select Save changes/);
  await h.click('Save changes', h.general()); await h.flush(); assert.equal(h.calls[0][1].site_setting.announcement_enabled, true); assert.equal(h.generalProps().isSiteSettingsDirty, false);
});

test('email and storefront requests save independently and preserve drafts through reverse-order full responses', async t => {
  const h = harness(t, Settings); await h.flush(); const email = deferred(), storefront = deferred();
  h.put = async (path, body) => { h.calls.push([path, body]); return path.endsWith('/settings') ? email.promise : storefront.promise; };
  const emailButton = h.button('Retail order emails', h.general()); emailButton.props.onClick(); emailButton.props.onClick();
  h.click('Enable Three Squares storefront', h.general()); await h.flush(); assert.equal(h.calls.length, 2);
  assert.match(text(h.general()), /Retail order emails: Saving…/); assert.match(text(h.general()), /Three Squares storefront: Saving…/);
  assert.equal(h.button('Wholesale order emails', h.general()).props.disabled, false);
  h.generalProps().onUpdateSettings({ store_name: 'Unsaved store', announcement_text: 'Unsaved banner' });
  h.generalProps().onUpdateShippingAddress({ city: 'Unsaved city' }); await h.flush(); assert.equal(h.button('Save changes', h.general()).props.disabled, true);
  storefront.resolve({ data: { ...initialSettings, enable_storefront_three_squares: true } }); await h.flush();
  email.resolve({ data: { settings: { ...initialSettings, send_retail_emails: true } } }); await h.flush();
  const value = h.generalProps().settings; assert.equal(value.store_name, 'Unsaved store'); assert.equal(value.announcement_text, 'Unsaved banner'); assert.equal(value.shipping_origin_address.city, 'Unsaved city');
  assert.equal(value.enable_storefront_three_squares, true); assert.equal(value.send_retail_emails, true); assert.equal(h.generalProps().isSiteSettingsDirty, true);
  assert.match(text(h.general()), /Retail order emails: Saved/); assert.match(text(h.general()), /Three Squares storefront: Saved/);
  h.click('Discard', h.general()); await h.flush(); assert.equal(h.generalProps().settings.send_retail_emails, true); assert.equal(h.generalProps().settings.enable_storefront_three_squares, true);
});

for (const [button, retry, field, payload] of [
  ['Retail order emails', 'Retail order emails', 'send_retail_emails', 'settings'],
  ['Enable Catering storefront', 'Catering storefront', 'enable_storefront_catering', 'site_setting'],
  ['Allow catering online orders', 'Catering online ordering', 'enable_catering_online_ordering', 'site_setting'],
]) test(`${field} failure retains saved state and drafts, then retries the same field payload`, async t => {
  const h = harness(t, Settings); await h.flush();
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  h.generalProps().onUpdateSettings({ announcement_text: 'Keep this draft' }); await h.flush();
  h.put = async () => { throw Error('Synthetic failure'); };
  if (field === 'enable_catering_online_ordering') h.find(node => node.type === 'input' && node.props.role === 'switch', h.general()).props.onChange();
  else h.click(button, h.general());
  await h.flush(); assert.equal(h.generalProps().settings[field], false); assert.match(text(h.general()), /Save was not confirmed. Current saved value loaded/);
  h.put = async (path, body) => { h.calls.push([path, body]); return { data: { settings: body.settings } }; };
  if (field === 'enable_catering_online_ordering') h.find(node => node.type === 'input' && node.props.role === 'switch', h.general()).props.onChange();
  else h.click(button, h.general());
  await h.flush(); assert.deepEqual(h.calls[0][1], { [payload]: { [field]: true } });
  assert.equal(h.generalProps().settings[field], true); assert.equal(h.generalProps().settings.announcement_text, 'Keep this draft'); assert.match(text(h.general()), /Saved/);
});

test('a manual save retains a newer draft typed while its response was pending', async t => {
  const h = harness(t, Settings); await h.flush(); h.generalProps().onUpdateSettings({ announcement_text: 'Submitted draft' }); await h.flush();
  const save = deferred(); h.put = () => save.promise;
  h.click('Save changes', h.general()); await h.flush(); h.generalProps().onUpdateSettings({ announcement_text: 'Newer draft' }); await h.flush();
  save.resolve({ data: { ...initialSettings, announcement_text: 'Submitted draft' } }); await h.flush();
  assert.equal(h.generalProps().settings.announcement_text, 'Newer draft'); assert.equal(h.generalProps().isSiteSettingsDirty, true);
  h.click('Discard', h.general()); await h.flush(); assert.equal(h.generalProps().settings.announcement_text, 'Submitted draft');
});

test('product More actions uses a named native disclosure with ordinary command buttons', async t => {
  const h = harness(t, Products, { products: [{ id: 1, name: 'Synthetic product', base_price_cents: 100 }], totalPages: 1 }); await h.flush();
  const action = h.find(node => node.type?.name === 'ActionMenu');
  const html = renderToStaticMarkup(createElement(action.type, action.props));
  assert.match(html, /<details/);
  assert.match(html, /<summary aria-label="More actions for Synthetic product" data-ui-control="action-menu"/);
  assert.match(html, /Publish/); assert.match(html, /Duplicate/); assert.match(html, /Archive/);
});

for (const button of ['Retail order emails', 'Enable Catering storefront']) test(`${button} ignores completion after unmount`, async t => {
  const h = harness(t, Settings); await h.flush(); const pending = deferred(); h.put = () => pending.promise;
  h.click(button, h.general()); await h.flush(); h.unmount();
  const writes = h.writes, toasts = h.toasts.length;
  pending.resolve({ data: { settings: { send_retail_emails: true } } });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.writes, writes); assert.equal(h.toasts.length, toasts); assert.equal(h.invalidations, 0);
});

for (const [field, button, email] of [
  ['enable_catering_online_ordering', null, false],
  ['enable_storefront_catering', 'Enable Catering storefront', false],
  ['send_retail_emails', 'Retail order emails', true],
]) test(`${field}: lost write response reads the committed field without overwriting drafts`, async t => {
  const h = harness(t, Settings); await h.flush();
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  h.generalProps().onUpdateSettings({ announcement_text: 'Keep newer banner', store_name: 'Keep newer store' }); await h.flush();
  h.put = async () => { throw Error('Response lost after commit'); };
  h.get = async () => ({ data: email ? { settings: { [field]: true } } : { [field]: true, announcement_text: 'Old server banner' } });
  if (button) h.click(button, h.general());
  else h.find(node => node.type === 'input' && node.props.role === 'switch', h.general()).props.onChange();
  await h.flush();
  assert.equal(h.generalProps().settings[field], true);
  assert.equal(h.generalProps().settings.announcement_text, 'Keep newer banner');
  assert.equal(h.generalProps().settings.store_name, 'Keep newer store');
  assert.match(text(h.general()), /Current saved value loaded/);
  assert.doesNotMatch(text(h.general()), /Change was not saved/);
});

test('an unknown save blocks another write until a field-only read succeeds', async t => {
  const h = harness(t, Settings); await h.flush();
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  let writes = 0;
  h.put = async () => { writes++; throw Error('Lost response'); };
  h.get = async () => { throw Error('Still offline'); };
  h.click('Enable Catering storefront', h.general()); await h.flush();
  assert.equal(h.button('Enable Catering storefront', h.general()).props.disabled, true);
  assert.match(text(h.general()), /Save outcome unknown/);
  assert.doesNotMatch(text(h.general()), /Change was not saved/);
  h.get = async () => ({ data: { enable_storefront_catering: true } });
  h.click('Check saved Catering storefront', h.general()); await h.flush();
  assert.equal(writes, 1); assert.equal(h.generalProps().settings.enable_storefront_catering, true);
  assert.equal(h.button('Enable Catering storefront', h.general()).props.disabled, false);
});

for (const button of ['Retail order emails', 'Enable Catering storefront']) test(`${button} reconciliation completion after unmount emits no toast`, async t => {
  const h = harness(t, Settings); await h.flush();
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  const read = deferred();
  h.put = async () => { throw Error('Response lost'); };
  h.get = () => read.promise;
  h.click(button, h.general()); await h.flush(); h.unmount();
  const writes = h.writes, toasts = h.toasts.length;
  read.resolve({ data: { settings: { send_retail_emails: true }, enable_storefront_catering: true } });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.writes, writes); assert.equal(h.toasts.length, toasts);
});

for (const [name, Component] of [['dashboard', Dashboard], ['analytics', Analytics]]) for (const count of [1, 2]) {
  test(`${name} explains ${count} excluded simulated order(s) without adding them to production revenue`, async t => {
    const h = harness(t, Component);
    h.get = async path => ({ data: path.endsWith('/stats') ? { total_orders: 1, total_revenue_cents: 750, pending_orders: 0, total_products: 1, excluded_simulated_order_count: count }
      : path.endsWith('/chart_data') ? { ...chart(), excluded_simulated_order_count: count } : { orders: [] } });
    await h.flush();
    const notice = h.find(node => node.props?.role === 'note');
    assert.match(text(notice), /Simulated orders aren't counted in revenue/);
    assert.ok(text(notice).includes(`${count} simulated ${count === 1 ? 'order' : 'orders'} in your location scope (all time)`));
    assert.match(text(notice), /production-only; no simulated money is included/);
    if (name === 'dashboard') assert.equal(h.find(node => node.props?.label === 'All-time net revenue').props.value, '$7.50');
  });
}


test('payment section is read-only and status refresh cannot replace an unrelated settings draft', async t => {
  const h = harness(t, Settings); await h.flush();
  h.generalProps().onUpdateSettings({ store_name: 'Unsaved owner draft' }); await h.flush();
  assert.equal(h.generalProps().settings.store_name, 'Unsaved owner draft');
  assert.equal(h.generalProps().onToggleTestMode, undefined);
  assert.doesNotMatch(text(h.general()), /Payment Test Mode|Real payments will|all payments are simulated|Payment Processor|Active/);
  assert.equal(nodes(h.general()).some(node => node.type === 'img' && /stripe\.com/.test(node.props?.src ?? '')), false);
  assert.ok(nodes(h.general()).some(node => node.type?.name === 'PaymentStatusPanel'));
  assert.equal(h.calls.length, 0);
});

const paymentStatus = provider => ({ selected_provider: provider, production_deployment: false,
  profiles: [{location_id: 1, location_name: 'Fictional kitchen', channel: 'online', provider, identity_id: 'fixture-identity', profile_id: 'fixture-profile', environment: 'sandbox', network_gate_enabled: false, real_dispatch_enabled: false, blockers: ['Waiting on Worldpay credentials and application configuration.']}] });
test('payments panel exposes loaded blockers, retains no active claim on refresh failure and retries independently', async t => {
  const h = harness(t, PaymentsPanel); h.get = async () => ({ data: paymentStatus('worldpay') }); await h.flush();
  assert.match(text(h.tree), /Waiting on Worldpay credentials/);
  assert.match(text(h.tree), /Real processor requests: Blocked \/ disabled/);
  assert.equal(nodes(h.tree).some(node => node.props?.role === 'switch'), false);
  h.get = async () => { throw Error('Offline'); }; h.click('Refresh payments status'); await h.flush();
  assert.match(text(h.find(node => node.props?.role === 'alert')), /Previously loaded status may be out of date/);
  assert.doesNotMatch(text(h.tree), /Real processor requests:/);
  h.get = async () => ({ data: paymentStatus('stripe') }); h.click('Retry payments status'); await h.flush();
  assert.match(text(h.tree), /Selected provider for new payments: Stripe/);
});
test('payments panel discards late responses after refresh and after unmount', async t => {
  const h = harness(t, PaymentsPanel); const old = deferred(); h.get = () => old.promise; await h.flush();
  h.get = async () => ({ data: paymentStatus('stripe') }); h.click('Refresh payments status'); await h.flush();
  old.resolve({data: paymentStatus('worldpay')}); await h.flush();
  assert.match(text(h.tree), /Selected provider for new payments: Stripe/);
  const late = deferred(); h.get = () => late.promise; h.click('Refresh payments status'); await h.flush();
  h.unmount(); const writes = h.writes; late.resolve({ data: paymentStatus('worldpay') }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.writes, writes);
});


test('payments panel reloads after a token function change, ignores its old response and can refresh again', async t => {
  const h = harness(t, PaymentsPanel); const old = deferred(); h.get = () => old.promise; await h.flush();
  const originalToken = h.getToken;
  h.getToken = async () => 'replacement-synthetic-token';
  h.get = async (_, token) => { assert.equal(token, h.getToken); return { data: paymentStatus('stripe') }; };
  await h.flush();
  assert.match(text(h.tree), /Selected provider for new payments: Stripe/);
  assert.equal(h.button('Refresh payments status').props.disabled, false);
  old.resolve({ data: paymentStatus('worldpay') }); await h.flush();
  assert.match(text(h.tree), /Selected provider for new payments: Stripe/);
  assert.notEqual(originalToken, h.getToken);
  h.click('Refresh payments status'); await h.flush();
  assert.equal(h.button('Refresh payments status').props.disabled, false);
  assert.doesNotMatch(text(h.tree), /Loading payments status/);
});


for (const endpoint of ['/site_settings', '/settings']) test(`ordering section remains mounted while General Settings ${endpoint} loads or fails`, async t => {
  const h = harness(t, Settings), pending = deferred();
  const get = h.get;
  h.get = path => path.endsWith(endpoint) ? pending.promise : get(path);
  await h.flush();
  h.find(node => node.type?.name === 'OnlineOrderingSection');
  assert.match(text(h.tree), /Loading settings/);
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  pending.reject(Error('Synthetic settings failure')); await h.flush();
  h.find(node => node.type?.name === 'OnlineOrderingSection');
  assert.match(text(h.tree), /Failed to load settings/);
  assert.equal(nodes(h.tree).some(node => node.type?.name === 'GeneralSettingsTab'), false);
});
