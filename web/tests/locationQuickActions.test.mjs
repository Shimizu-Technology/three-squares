import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Deterministic event/effect tests, without real public navigation or runtime resources.
// Native popup/clipboard/print behavior and four-viewport acceptance remain parent QA.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const ctx = 'globalThis.__locationQuickActions';
const mocks = {
  react: moduleUrl(['useState', 'useRef', 'useEffect', 'useCallback'].map(name => `export const ${name} = (...args) => ${ctx}.${name}(...args);`).join('\n')),
  '@clerk/clerk-react': moduleUrl(`export const useAuth = () => ({ getToken: ${ctx}.getToken });`),
  'react-hot-toast': moduleUrl(`export default { success: (...args) => ${ctx}.toasts.push(args), error: (...args) => ${ctx}.toasts.push(args) };`),
  '../../services/authApi': moduleUrl(['Get', 'Post', 'Put', 'Delete'].map(method => `export const auth${method} = (...args) => ${ctx}.${method.toLowerCase()}(...args);`).join('\n')),
  '../../components/admin/StaffAccess.tsx': moduleUrl(`export const useStaffAccess = () => ${ctx}.access;`),
  '../../components/admin/AdminRequestState': moduleUrl('export default function RequestState() { return null; }'),
  '../../components/admin/LocationQrCode': moduleUrl('export default function QrActions() { return null; }'),
};
async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(mocks[name] || import.meta.resolve(name))}`);
  return (await import(moduleUrl(code))).default;
}
const Page = await load('../src/pages/admin/AdminLocationsPage.tsx');
const QrActions = await load('../src/components/admin/LocationQrCode.tsx');
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
const text = node => typeof node === 'string' ? node : node && typeof node !== 'boolean' ? [node?.props?.children].flat(Infinity).map(text).join('') : '';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const saved = { id: 2, name: 'Donki <long location>', slug: 'donki', active: true, hours_json: { Monday: '10:00 - 22:00' }, address: 'Guam', phone: '671', admin_email: 'owner@example.test', admin_sms_phones: [] };
const qr = { menu_url: 'https://configured.example.test/order/donki?source=qr', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
function harness(t, Component, owner = true) {
  const hooks = [], effects = [], calls = [], popups = [];
  let cursor = 0, tree;
  const h = {
    calls, popups, toasts: [], props: { id: 2, name: saved.name, slug: saved.slug },
    access: { can: () => owner, roleLabel: owner ? 'Owner' : 'Manager', scopeLabel: owner ? 'All locations' : saved.name },
    getToken: async () => 'synthetic',
    get: async () => ({ data: { data: [structuredClone(saved)] } }),
    post: async (...args) => { calls.push(args); return { data: { data: qr } }; },
    put: async (...args) => { calls.push(args); return { data: { data: saved } }; },
    delete: async () => ({}),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef(initial) { return hooks[cursor++] ||= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((v, i) => !Object.is(v, hooks[index].deps[i]))) hooks[index] = { fn, deps };
      return hooks[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((v, i) => !Object.is(v, hooks[index].deps[i]))) effects.push(() => {
        hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: fn() };
      });
    },
    render() { globalThis.__locationQuickActions = h; cursor = 0; tree = Component(h.props); return tree; },
    async flush() { for (let i = 0; i < 20; i++) { h.render(); for (const fn of effects.splice(0)) fn(); await Promise.resolve(); } },
    find(predicate, root = tree) { const found = elements(root).find(predicate); assert.ok(found, 'Expected location control'); return found; },
    button(label, root = tree) { return h.find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label), root); },
    field(label, root = tree) { const row = h.find(node => node.type === 'label' && text(node).trim() === label, root); return h.find(node => node.type === 'input' || node.type === 'textarea', row); },
    click(label) { h.trigger = { isConnected: true, focus: () => { h.focused = label; } }; h.button(label).props.onClick({ currentTarget: h.trigger }); },
    region() { return h.find(node => node.props?.role === 'region'); },
    get tree() { return tree; },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
    open() {
      const nodes = [];
      const popup = {
        closed: false, opener: {}, location: { href: 'about:blank', replace(value) { this.href = value; } },
        document: { title: '', body: { childNodes: nodes, style: {}, append(...items) { nodes.push(...items); } }, createElement(tag) {
          return { tag, style: {}, click() {}, set src(value) { this._src = value; if (h.imageFailure) this.onerror?.(); else if (!h.imageHangs) this.onload?.(); } };
        } },
        close() { this.closed = true; }, focus() {}, print() { h.printed = true; },
        addEventListener(name, fn) { popup[name] = fn; },
      };
      popups.push(popup); return popup;
    },
  };
  globalThis.window = { open: () => h.open(), focus() {}, confirm: () => true };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { h.copied = value; } } } });
  h.render(); t.after(() => h.unmount()); return h;
}

for (const owner of [true, false]) test(`${owner ? 'owner' : 'scoped manager'}: saved cards lead; edit is separate; drafts never masquerade as saved`, async t => {
  const h = harness(t, Page, owner); await h.flush();
  const region = h.region();
  const disclosure = h.find(node => node.type === 'details', region);
  assert.equal(disclosure.props.open, undefined);
  const qrNode = h.find(node => node.type?.name === 'QrActions', region);
  assert.ok(elements(region).indexOf(qrNode) < elements(region).indexOf(disclosure));
  assert.ok(!elements(disclosure).includes(qrNode));
  assert.match(text(region), /Saved: Active/);
  assert.match(text(h.tree), owner ? /Owner · All locations/ : /Manager · Donki/);
  const add = elements(h.tree).find(node => node.type === 'details' && text(node).includes('Add Location'));
  assert.equal(!!add, owner);
  if (add) assert.ok(elements(h.tree).indexOf(add) > elements(h.tree).indexOf(region));
  assert.equal(h.field('Location name', region).props.disabled, !owner);
  assert.equal(h.field('Location admin email', region).props.disabled, !owner);
  assert.equal(elements(region).some(node => node.type === 'button' && text(node) === 'Delete'), owner);
  h.field('Active', region).props.onChange({ target: { checked: false } });
  if (owner) h.field('Location name', region).props.onChange({ target: { value: 'Unsaved replacement' } });
  h.find(node => node.type?.name === 'HoursFields', region).props.onChange('Monday', 'Closed');
  await h.flush();
  assert.match(text(h.region()), /Saved: Active/);
  assert.equal(h.find(node => node.type?.name === 'SavedHours').props.hours.Monday, '10:00 - 22:00');
  assert.equal(h.find(node => node.type?.name === 'QrActions').props.name, saved.name);
  h.get = async () => ({ data: { data: [{ ...saved, hours_json: { Monday: '12:00 - 16:00' } }] } });
  h.click('Refresh locations'); await h.flush();
  assert.equal(h.field('Active', h.region()).props.checked, false);
  assert.equal(h.find(node => node.type?.name === 'HoursFields').props.hours.Monday, 'Closed');
  assert.equal(h.find(node => node.type?.name === 'SavedHours').props.hours.Monday, '12:00 - 16:00');
  h.click('Save'); await h.flush();
  const payload = h.calls[0][1].location;
  assert.equal(payload.hours_json.Monday, 'Closed'); assert.equal(payload.active, false);
  if (!owner) assert.deepEqual(Object.keys(payload).sort(), ['active', 'hours_json']);
  else assert.equal(payload.name, 'Unsaved replacement');
});

test('failed saves/refresh retain drafts and recovery; saved status updates only after confirmed reload', async t => {
  const h = harness(t, Page); await h.flush();
  h.field('Active', h.region()).props.onChange({ target: { checked: false } }); await h.flush();
  h.put = async () => { throw Error('Synthetic failure'); };
  const original = console.error; console.error = () => {}; t.after(() => { console.error = original; });
  h.click('Save'); await h.flush();
  assert.equal(h.field('Active', h.region()).props.checked, false); assert.match(text(h.region()), /Saved: Active/);
  h.get = async () => { throw Error('Synthetic refresh failure'); };
  h.click('Refresh locations'); await h.flush();
  assert.equal(h.find(node => node.type?.name === 'RequestState').props.error, true);
  assert.equal(h.field('Active', h.region()).props.checked, false);
  h.put = async () => ({}); h.get = async () => ({ data: { data: [{ ...saved, active: false }] } });
  h.click('Save'); await h.flush();
  assert.match(text(h.region()), /Saved: Inactive/);
  assert.equal(h.find(node => node.type?.name === 'RequestState').props.error, false);
});

test('late load cannot replace newer saved list or revive an unmounted page', async t => {
  const h = harness(t, Page); const old = deferred(); h.get = () => old.promise; await h.flush();
  h.get = async () => ({ data: { data: [{ ...saved, name: 'Newest saved name' }] } });
  h.click('Refresh locations'); await h.flush();
  old.resolve({ data: { data: [saved] } }); await h.flush(); assert.match(text(h.region()), /Newest saved name/);
  const late = deferred(); h.get = () => late.promise;
  h.click('Refresh locations'); await h.flush(); h.unmount();
  late.resolve({ data: { data: [] } }); await h.flush(); assert.match(text(h.region()), /Newest saved name/);
});

for (const action of ['View menu', 'Print QR']) test(`${action}: synchronous popup reservation, authoritative URL and named print sheet`, async t => {
  const h = harness(t, QrActions); await h.flush(); assert.equal(h.calls.length, 0);
  for (const label of ['View menu', 'Copy URL', 'Print QR']) assert.ok(h.button(`${label} for ${saved.name}`).props.className.includes('min-h-11'));
  const pending = deferred(); h.post = (...args) => { h.calls.push(args); assert.equal(h.popups.length, 1); return pending.promise; };
  h.click(`${action} for ${saved.name}`);
  assert.equal(h.popups.length, 1); assert.equal(h.popups[0].opener, null); assert.equal(h.popups[0].location.href, 'about:blank');
  h.click(`${action} for ${saved.name}`); assert.equal(h.popups.length, 1, 'Double click cannot create another popup');
  pending.resolve({ data: { data: qr } }); await h.flush();
  assert.equal(h.calls[0][0], '/admin/locations/2/generate_qr'); assert.deepEqual(h.calls[0][1], {}); assert.equal(h.calls[0][3].timeout, 20000);
  if (action === 'View menu') assert.equal(h.popups[0].location.href, qr.menu_url);
  else {
    const sheet = h.popups[0].document;
    assert.equal(sheet.title, `${saved.name} menu QR code`);
    assert.deepEqual(sheet.body.childNodes.map(node => node.textContent).filter(Boolean), [saved.name, 'Scan to view this location’s menu', qr.menu_url]);
    assert.ok(sheet.body.childNodes.find(node => node.tag === 'img')._src.includes(encodeURIComponent(qr.svg)));
    assert.equal(h.printed, true); h.popups[0].afterprint(); assert.equal(h.focused, `${action} for ${saved.name}`);
  }
});

test('copy lazily resolves saved URL, reports clipboard denial and retries from same named control', async t => {
  const h = harness(t, QrActions); await h.flush(); navigator.clipboard.writeText = async () => { throw Error('Denied'); };
  h.click(`Copy URL for ${saved.name}`); await h.flush(); assert.match(text(h.tree), /Could not copy the menu URL/);
  assert.equal(h.focused, `Copy URL for ${saved.name}`); assert.equal(h.popups.length, 0);
  assert.equal(h.find(node => node.type === 'a').props.href, qr.menu_url);
  navigator.clipboard.writeText = async value => { h.copied = value; };
  h.click(`Copy URL for ${saved.name}`); await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.copied, qr.menu_url);
  assert.match(text(h.tree), /Menu URL copied for Donki/); assert.equal(elements(h.tree).some(node => node.props?.role === 'alert'), false);
});

for (const action of ['View menu', 'Print QR']) test(`${action}: popup block avoids network; failure closes owned empty popup; retry recovers`, async t => {
  const h = harness(t, QrActions); await h.flush(); window.open = () => null;
  h.click(`${action} for ${saved.name}`); await h.flush(); assert.equal(h.calls.length, 0); assert.match(text(h.tree), /Allow pop-ups/);
  window.open = () => h.open(); h.post = async () => { throw Error('Server unavailable'); };
  h.click(`${action} for ${saved.name}`); await h.flush(); assert.equal(h.popups[0].closed, true);
  assert.equal(h.focused, `${action} for ${saved.name}`); assert.equal(h.button(`${action} for ${saved.name}`).props['aria-disabled'], false);
  h.post = async () => ({ data: { data: qr } });
  h.click(`${action} for ${saved.name}`); await h.flush(); assert.equal(h.popups[1].closed, false);
});

test('20s deadline releases busy state, closes empty popup, ignores late response and permits retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, QrActions); await h.flush(); const late = deferred(); h.post = () => late.promise;
  h.click(`Print QR for ${saved.name}`); await h.flush(); t.mock.timers.tick(20000); await h.flush();
  assert.equal(h.popups[0].closed, true); assert.match(text(h.tree), /Could not print qr/);
  late.resolve({ data: { data: qr } }); await h.flush(); assert.equal(h.printed, undefined);
  h.post = async () => ({ data: { data: qr } }); h.click(`Print QR for ${saved.name}`); await h.flush(); assert.equal(h.printed, true);
});

test('unmount aborts generation and closes exact pending blank popup', async t => {
  const h = harness(t, QrActions); await h.flush(); const pending = deferred(); h.post = () => pending.promise;
  h.click(`View menu for ${saved.name}`); await h.flush(); h.unmount(); assert.equal(h.popups[0].closed, true);
  pending.resolve({ data: { data: qr } }); await h.flush(); assert.equal(h.popups[0].location.href, 'about:blank');
});

test('navigated popup survives failure; malformed server URL cannot navigate or print', async t => {
  const h = harness(t, QrActions); await h.flush(); const pending = deferred(); h.post = () => pending.promise;
  h.click(`View menu for ${saved.name}`); h.popups[0].location.href = 'https://user.example.test/';
  pending.reject(Error('Failed')); await h.flush(); assert.equal(h.popups[0].closed, false);
  h.post = async () => ({ data: { data: { ...qr, menu_url: 'javascript:alert(1)' } } });
  h.click(`Print QR for ${saved.name}`); await h.flush(); assert.equal(h.popups[1].closed, true); assert.equal(h.printed, undefined);
});

test('QR image failure closes empty print popup and retries without regenerating', async t => {
  const h = harness(t, QrActions); await h.flush(); h.imageFailure = true;
  h.click(`Print QR for ${saved.name}`); await h.flush(); assert.equal(h.popups[0].closed, true); assert.equal(h.printed, undefined);
  h.imageFailure = false; h.click(`Print QR for ${saved.name}`); await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.printed, true);
});

test('promise-backed clipboard write starts in the click gesture and waits for the configured URL', async t => {
  const h = harness(t, QrActions); await h.flush();
  const pending = deferred(); h.post = () => pending.promise;
  const original = globalThis.ClipboardItem;
  globalThis.ClipboardItem = class { constructor(content) { this.content = content; } };
  t.after(() => { if (original) globalThis.ClipboardItem = original; else delete globalThis.ClipboardItem; });
  let writeStarted = false;
  navigator.clipboard.write = async ([item]) => { writeStarted = true; h.copied = await (await item.content['text/plain']).text(); };
  h.click(`Copy URL for ${saved.name}`);
  assert.equal(writeStarted, true); assert.equal(h.copied, undefined);
  pending.resolve({ data: { data: qr } });
  // Blob.text() completes beyond the deterministic microtask-only hook flush.
  await new Promise(resolve => setImmediate(resolve)); await h.flush();
  assert.equal(h.copied, qr.menu_url); assert.match(text(h.tree), /Menu URL copied for Donki/);
});

test('user-navigated popup is never overwritten by a late successful response', async t => {
  const h = harness(t, QrActions); await h.flush(); const pending = deferred(); h.post = () => pending.promise;
  h.click(`View menu for ${saved.name}`); h.popups[0].location.href = 'https://user.example.test/';
  pending.resolve({ data: { data: qr } }); await h.flush();
  assert.equal(h.popups[0].location.href, 'https://user.example.test/'); assert.equal(h.popups[0].closed, false);
  assert.match(text(h.tree), /Could not view menu/);
});

test('image load has the same bounded deadline and never prints after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, QrActions); await h.flush(); h.imageHangs = true;
  h.click(`Print QR for ${saved.name}`); await h.flush();
  t.mock.timers.tick(20000); await h.flush();
  assert.equal(h.popups[0].closed, true); assert.equal(h.printed, undefined);
  assert.equal(h.button(`Print QR for ${saved.name}`).props['aria-disabled'], false);
});
