import test from 'node:test';
import assert from 'node:assert/strict';

test('homepage merchandising has a separate global-manager destination', () => {
  assert.equal(canAccessStaffRoute(manager(), '/admin/homepage'), true);
  assert.equal(canAccessStaffRoute(manager(), '/admin/settings'), false);
  assert.equal(canAccessStaffRoute(manager({ capabilities: ['catalog.manage'] }), '/admin/homepage'), false);
  assert.equal(canAccessStaffRoute(staff(), '/admin/homepage'), false);
});
import {
  STAFF_CAPABILITIES, normalizeStaffAccess, hasStaffCapability, needsLocationAssignment,
  staffScopeLabel, canAccessStaffRoute, staffRootRedirect, deviceLocations,
  canAssignDeviceLocation, deviceReadPaths,
} from '../src/components/admin/staffAccess.ts';

const main = { id: 1, name: 'Main', slug: 'main' };
const second = { id: 2, name: 'Second counter', slug: 'second' };
const me = (overrides = {}) => normalizeStaffAccess({
  id: 7, clerk_id: 'user_fixture', email: 'fixture@example.test', name: null, phone: null,
  role: 'owner', admin: true, assigned_location_id: null, assigned_location_name: null,
  location_scoped: false, operational_scope: 'all', authorized_locations: [main, second],
  capabilities: [...STAFF_CAPABILITIES], ...overrides,
});
const staff = (overrides = {}) => me({
  role: 'staff', admin: false, assigned_location_id: 2, assigned_location_name: second.name,
  location_scoped: true, operational_scope: 'specific', authorized_locations: [second],
  capabilities: ['account.self', 'orders.read', 'orders.counts', 'orders.status', 'pos.sell', 'payments.collect', 'availability.manage', 'devices.self'], ...overrides,
});
const manager = (overrides = {}) => me({
  role: 'manager', admin: false,
  capabilities: ['account.self', 'orders.read', 'orders.export', 'analytics.read', 'devices.manage', 'devices.self', 'locations.read', 'locations.update', 'locations.qr', 'catalog.manage', 'catalog.import', 'stock.read', 'stock.manage', 'homepage.manage', 'payments.terminals.manage', 'catering.manage', 'pos.sell'],
  ...overrides,
});

test('legacy admin is never a fallback and omitted/unknown capabilities fail closed', () => {
  for (const role of ['owner', 'manager', 'staff']) {
    const user = me({ role, admin: true, capabilities: undefined });
    for (const path of ['/admin', '/admin/users', '/admin/orders', '/admin/future']) assert.equal(canAccessStaffRoute(user, path), false, `${role} ${path}`);
  }
  assert.equal(normalizeStaffAccess({ id: 7, clerk_id: 'user_fixture', admin: true }), null);
  assert.equal(me({ role: 'administrator' }), null);
  assert.equal(hasStaffCapability(me(), 'something.future'), false);
  assert.deepEqual(me({ capabilities: ['analytics.read', 'something.future', 1] }).capabilities, ['analytics.read']);
  for (const value of [null, {}, [], { role: 'owner' }, { id: '7', clerk_id: 'user_fixture', role: 'owner' }]) assert.equal(normalizeStaffAccess(value), null);
});

test('customer and missing/unknown operational scope cannot use otherwise-present privileges', () => {
  for (const user of [null, me({ role: 'customer' }), me({ operational_scope: undefined }), me({ operational_scope: 'unknown' })]) {
    assert.equal(hasStaffCapability(user, 'orders.read'), false);
    assert.equal(canAccessStaffRoute(user, '/admin/orders'), false);
    assert.deepEqual(deviceReadPaths(user), []);
  }
});

test('staff with missing, stale or global assignment cannot become a global operator', () => {
  for (const overrides of [
    { assigned_location_id: null }, { assigned_location_id: 99 }, { authorized_locations: [] },
    { operational_scope: 'all' }, { operational_scope: 'none' },
  ]) {
    const user = staff(overrides);
    assert.equal(needsLocationAssignment(user), true);
    assert.equal(staffScopeLabel(user), 'No location assigned');
    for (const cap of user.capabilities) assert.equal(hasStaffCapability(user, cap), false);
    assert.deepEqual(deviceLocations(user), []);
    assert.deepEqual(deviceReadPaths(user), []);
    assert.equal(staffRootRedirect(user, '/admin'), null);
  }
});

test('every current shell/POS route is covered by an explicit server capability', () => {
  const matrix = [
    ['/admin', 'analytics.read'], ['/admin/analytics', 'analytics.read'],
    ['/admin/orders', 'orders.read'], ['/admin/orders/pickup-queue', 'orders.read'], ['/admin/orders/shipping-queue', 'orders.read'],
    ['/admin/products', 'catalog.manage'], ['/admin/products/new', 'catalog.manage'], ['/admin/products/12/edit', 'catalog.manage'],
    ['/admin/collections', 'catalog.manage'], ['/admin/settings/variant-presets', 'catalog.manage'],
    ['/admin/locations', 'locations.read'], ['/admin/inventory', 'stock.read'], ['/admin/pos', 'pos.sell'],
    ['/admin/catering', 'catering.manage'], ['/admin/devices', 'devices.self'], ['/admin/users', 'users.manage'],
    ['/admin/import', 'catalog.import'], ['/admin/settings', 'settings.manage'],
  ];
  for (const [path, cap] of matrix) {
    const user = manager({ capabilities: [cap] });
    assert.equal(canAccessStaffRoute(user, path), true, path);
    assert.equal(canAccessStaffRoute(manager({ capabilities: [] }), path), false, path);
    assert.equal(canAccessStaffRoute(user, path + '/'), true, path);
  }
  assert.equal(canAccessStaffRoute(manager({ capabilities: ['devices.manage'] }), '/admin/devices'), true);
  assert.equal(canAccessStaffRoute(manager({ capabilities: ['catalog.manage'] }), '/admin/settings'), false);
});

test('staff navigation admits only queue/order/POS/device destinations', () => {
  const user = staff();
  for (const path of ['/admin/orders', '/admin/orders/pickup-queue', '/admin/orders/shipping-queue', '/admin/pos', '/admin/devices']) assert.equal(canAccessStaffRoute(user, path), true, path);
  for (const path of ['/admin', '/admin/analytics', '/admin/products', '/admin/collections', '/admin/users', '/admin/settings', '/admin/settings/variant-presets', '/admin/inventory', '/admin/locations', '/admin/import', '/admin/catering']) assert.equal(canAccessStaffRoute(user, path), false, path);
  assert.equal(staffScopeLabel(user), second.name);
});

test('manager global catalog and operational scope do not imply owner privileges', () => {
  for (const user of [manager(), manager({ operational_scope: 'specific', location_scoped: true, assigned_location_id: 2, authorized_locations: [second] })]) {
    for (const path of ['/admin', '/admin/orders', '/admin/analytics', '/admin/products', '/admin/import', '/admin/inventory', '/admin/catering', '/admin/locations', '/admin/devices']) assert.equal(canAccessStaffRoute(user, path), true, path);
    for (const path of ['/admin/users', '/admin/settings', '/admin/new-tool']) assert.equal(canAccessStaffRoute(user, path), false, path);
  }
  assert.equal(staffScopeLabel(manager()), 'All locations');
});

test('unknown UI routes stay owner-only and cannot inherit a known parent capability', () => {
  for (const path of ['/admin/new-tool', '/admin/orders/new-tool', '/admin/settings/payments', '/admin/products/12/delete']) {
    assert.equal(canAccessStaffRoute(me(), path), true, path);
    assert.equal(canAccessStaffRoute(manager(), path), false, path);
    assert.equal(canAccessStaffRoute(staff(), path), false, path);
    assert.equal(canAccessStaffRoute(me({ capabilities: [] }), path), false, path);
  }
});

test('staff root redirect is bounded to the dashboard and never rewrites a known task URL', () => {
  assert.equal(staffRootRedirect(staff(), '/admin'), '/admin/orders/pickup-queue');
  assert.equal(staffRootRedirect(staff(), '/admin/'), '/admin/orders/pickup-queue');
  for (const path of ['/admin/orders', '/admin/devices', '/admin/products']) assert.equal(staffRootRedirect(staff(), path), null);
  assert.equal(staffRootRedirect(manager(), '/admin'), null);
  assert.equal(staffRootRedirect(me(), '/admin'), null);
});

test('device request plan excludes the index for staff and all requests for missing assignment', () => {
  assert.deepEqual(deviceReadPaths(staff()), ['/admin/devices/current']);
  for (const user of [me(), manager(), manager({ operational_scope: 'specific', assigned_location_id: 2, authorized_locations: [second] })]) assert.deepEqual(deviceReadPaths(user), ['/admin/devices', '/admin/devices/current']);
  assert.deepEqual(deviceReadPaths(staff({ assigned_location_id: null })), []);
  assert.deepEqual(deviceReadPaths(manager({ capabilities: ['account.self'] })), []);
  assert.equal(deviceReadPaths(me()).includes('/admin/locations'), false);
});

test('device location choices come from authorized Me locations and never expand specific scope', () => {
  const scopedManager = manager({ operational_scope: 'specific', assigned_location_id: 2 });
  for (const user of [staff({ authorized_locations: [main, second] }), scopedManager]) {
    assert.deepEqual(deviceLocations(user), [second]);
    assert.equal(canAssignDeviceLocation(user, 2), true);
    for (const location of [null, 1, 99, NaN]) assert.equal(canAssignDeviceLocation(user, location), false);
  }
  for (const user of [me(), manager()]) {
    assert.deepEqual(deviceLocations(user), [main, second]);
    for (const location of [null, 1, 2]) assert.equal(canAssignDeviceLocation(user, location), true);
    assert.equal(canAssignDeviceLocation(user, 99), false);
  }
  assert.deepEqual(me({ authorized_locations: [{ id: '1', name: 'Untrusted', slug: 'x' }, main, null] }).authorized_locations, [main]);
});

test('payment contract uses canonical names and recognizes limited location updates', () => {
  const user = me({ capabilities: ['payments.collect', 'payments.terminals.manage', 'payments.terminals.discover', 'payments.simulate', 'locations.update', 'pos.readers.read', 'pos.readers.discover'] });
  assert.deepEqual(user.capabilities, ['payments.collect', 'payments.terminals.manage', 'payments.terminals.discover', 'payments.simulate', 'locations.update']);
  assert.equal(hasStaffCapability(user, 'locations.manage'), false);
  assert.equal(hasStaffCapability(staff(), 'payments.collect'), true);
});

test('account-wide reconciliation uses its dedicated server capability', () => {
  const path = '/admin/payment-reconciliation';
  assert.equal(canAccessStaffRoute(manager({ capabilities: ['payments.reconcile'] }), path), true);
  assert.equal(canAccessStaffRoute(manager({ capabilities: ['analytics.read', 'payments.refund'] }), path), false);
  assert.equal(canAccessStaffRoute(staff(), path), false);
  assert.equal(canAccessStaffRoute(me({ capabilities: [] }), path), false);
});
