import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { normalizeStaffAccess, hasStaffCapability, staffScopeLabel, needsLocationAssignment } from '../src/components/admin/staffAccess.ts';

// Render the real shell with resolved access and Clerk fixtures. Native-dialog
// focus/interaction and provider effects are reserved for combined browser QA.
const output = await build({
  entryPoints: [fileURLToPath(new URL('../src/layouts/AdminLayout.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'resolved-access-fixtures', setup(bundler) {
    bundler.onResolve({ filter: /\/StaffAccess\.tsx$/ }, () => ({ path: 'access', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^@clerk\/clerk-react$/ }, () => ({ path: 'clerk', namespace: 'fixture' }));
    bundler.onResolve({ filter: /\/ui\/Dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'access' ? `
      import { createElement } from 'react';
      export const StaffAccessProvider = ({children}) => children;
      export const useStaffAccess = () => globalThis.__shellAccessFixture;
      export const StaffAccessDenied = () => createElement('div', {role:'alert'}, 'Denied fixture');
    ` : path === 'clerk' ? `export const useUser = () => ({user:{id:'user_fixture'},isLoaded:true});`
      : `export default function Dialog() { return null; }` }));
  } }],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const AdminLayout = compiled.exports.default;
const me = (overrides = {}) => normalizeStaffAccess({
  id: 7, clerk_id: 'user_fixture', role: 'staff', admin: false,
  assigned_location_id: 2, assigned_location_name: 'Second counter', operational_scope: 'specific', location_scoped: true,
  authorized_locations: [{ id: 2, name: 'Second counter', slug: 'second' }],
  capabilities: ['account.self', 'orders.read', 'pos.sell', 'devices.self'], ...overrides,
});
function render(user, url, overrides = {}) {
  globalThis.__shellAccessFixture = {
    user, loading: false, error: false, reload: async () => {},
    can: cap => hasStaffCapability(user, cap),
    roleLabel: user?.role || 'Signed out', scopeLabel: staffScopeLabel(user),
    assignmentRequired: needsLocationAssignment(user), ...overrides,
  };
  let mounts = 0;
  function PrivilegedPage() {
    mounts += 1;
    return React.createElement('div', { 'data-private': true }, useLocation().search);
  }
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [url] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/admin', element: React.createElement(AdminLayout) },
        React.createElement(Route, { path: '*', element: React.createElement(PrivilegedPage) })))));
  delete globalThis.__shellAccessFixture;
  return { html, mounts };
}

test('forbidden direct navigation never mounts the child and exposes only allowed navigation', () => {
  const { html, mounts } = render(me(), '/admin/users?search=existing');
  assert.equal(mounts, 0);
  assert.match(html, /Denied fixture/);
  assert.match(html, /Second counter/);
  assert.match(html, /href="\/admin\/orders\/pickup-queue"/);
  assert.match(html, /href="\/admin\/devices"/);
  for (const path of ['users', 'settings', 'products', 'inventory', 'analytics', 'import']) assert.doesNotMatch(html, new RegExp(`href="/admin/${path}"`));
});

test('allowed page keeps its complete query context and mounts once', () => {
  const { html, mounts } = render(me(), '/admin/orders?status=ready&location=2&page=3&id=45');
  assert.equal(mounts, 1);
  assert.match(html, /\?status=ready&amp;location=2&amp;page=3&amp;id=45/);
  assert.doesNotMatch(html, /Denied fixture/);
  assert.match(html, /Skip to content/);
  assert.match(html, /aria-label="Expand sidebar"/);
});

test('loading, retry failure, missing assignment and signed-out states do not mount pages', () => {
  const failed = render(me(), '/admin/orders', { error: true });
  assert.equal(failed.mounts, 0);
  assert.match(failed.html, /Retry access check/);
  const loading = render(me(), '/admin/orders', { loading: true });
  assert.equal(loading.mounts, 0);
  assert.match(loading.html, /Checking staff access/);
  for (const user of [null, me({ assigned_location_id: null })]) assert.equal(render(user, '/admin/orders').mounts, 0);
});

test('manager catalog preset access does not expose settings and unknown routes stay owner-only', () => {
  const manager = me({ role: 'manager', capabilities: ['account.self', 'catalog.manage'] });
  const presets = render(manager, '/admin/settings/variant-presets');
  assert.equal(presets.mounts, 1);
  assert.doesNotMatch(presets.html, /href="\/admin\/settings"/);
  assert.equal(render(manager, '/admin/settings/future').mounts, 0);
  assert.equal(render(me({ role: 'owner', operational_scope: 'all', capabilities: ['account.self'] }), '/admin/future').mounts, 1);
});

test('account-wide reconciliation nav and direct route obey the server capability', () => {
  const path = '/admin/payment-reconciliation';
  const allowed = me({ role: 'manager', assigned_location_id: null, operational_scope: 'all', capabilities: ['account.self', 'payments.reconcile'] });
  assert.equal(render(allowed, path).mounts, 1);
  assert.match(render(allowed, path).html, /href="\/admin\/payment-reconciliation"/);
  assert.equal(render(me(), path).mounts, 0);
  assert.doesNotMatch(render(me(), '/admin/orders').html, /href="\/admin\/payment-reconciliation"/);
});
