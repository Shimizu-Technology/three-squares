/** Server-issued capabilities are the only source of UI privileges. */
export const STAFF_CAPABILITIES = [
  'account.self', 'orders.read', 'orders.counts', 'orders.status', 'orders.manage', 'orders.notify', 'orders.export',
  'pos.sell', 'payments.collect', 'payments.refund', 'analytics.read', 'devices.self', 'devices.manage',
  'locations.read', 'locations.qr', 'locations.manage', 'locations.update', 'availability.manage',
  'catalog.manage', 'catalog.import', 'stock.read', 'stock.manage', 'seasonal.manage', 'catering.manage',
  'users.manage', 'settings.manage', 'payment_settings.manage', 'homepage.manage', 'payments.simulate',
  'payments.terminals.manage', 'payments.terminals.discover',
] as const;
export type StaffCapability = typeof STAFF_CAPABILITIES[number];
export type StaffRole = 'owner' | 'manager' | 'staff' | 'customer';
export interface StaffLocation { id: number; name: string; slug: string }
export interface StaffAccessUser {
  id: number;
  clerk_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: StaffRole;
  admin: boolean;
  assigned_location_id: number | null;
  assigned_location_name: string | null;
  location_scoped: boolean;
  capabilities: StaffCapability[];
  operational_scope: 'all' | 'specific' | 'none';
  authorized_locations: StaffLocation[];
}
const knownCapabilities = new Set<string>(STAFF_CAPABILITIES);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nullableText = (value: unknown) => typeof value === 'string' ? value : null;

export function normalizeStaffAccess(value: unknown): StaffAccessUser | null {
  if (!record(value) || !positiveId(value.id) || typeof value.clerk_id !== 'string' ||
      !['owner', 'manager', 'staff', 'customer'].includes(String(value.role))) return null;
  const locations: StaffLocation[] = Array.isArray(value.authorized_locations)
    ? value.authorized_locations.filter((entry): entry is StaffLocation => record(entry) && positiveId(entry.id) && typeof entry.name === 'string' && typeof entry.slug === 'string') : [];
  return {
    id: value.id, clerk_id: value.clerk_id, email: nullableText(value.email), name: nullableText(value.name), phone: nullableText(value.phone),
    role: value.role as StaffRole, admin: value.admin === true,
    assigned_location_id: positiveId(value.assigned_location_id) ? value.assigned_location_id : null,
    assigned_location_name: nullableText(value.assigned_location_name), location_scoped: value.location_scoped === true,
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.filter((cap): cap is StaffCapability => typeof cap === 'string' && knownCapabilities.has(cap)) : [],
    operational_scope: value.operational_scope === 'all' || value.operational_scope === 'specific' ? value.operational_scope : 'none',
    authorized_locations: locations,
  };
}

export function needsLocationAssignment(user: StaffAccessUser | null): boolean {
  if (!user || (user.role !== 'staff' && user.operational_scope !== 'specific')) return false;
  return user.operational_scope !== 'specific' || !user.assigned_location_id ||
    !user.authorized_locations.some(location => location.id === user.assigned_location_id);
}

export function hasStaffCapability(user: StaffAccessUser | null, capability: StaffCapability): boolean {
  return !!user && ['owner', 'manager', 'staff'].includes(user.role) && user.operational_scope !== 'none' &&
    !needsLocationAssignment(user) && knownCapabilities.has(capability) && user.capabilities.includes(capability);
}

export function staffScopeLabel(user: StaffAccessUser | null): string {
  if (needsLocationAssignment(user)) return 'No location assigned';
  if (user?.operational_scope === 'all') return 'All locations';
  if (user?.operational_scope === 'specific') return user.authorized_locations.find(location => location.id === user.assigned_location_id)?.name || 'No authorized location';
  return 'No operational access';
}

const ROUTE_CAPABILITIES: Record<string, StaffCapability[]> = {
  '/admin': ['analytics.read'], '/admin/analytics': ['analytics.read'],
  '/admin/orders': ['orders.read'], '/admin/orders/pickup-queue': ['orders.read'], '/admin/orders/shipping-queue': ['orders.read'],
  '/admin/products': ['catalog.manage'], '/admin/products/new': ['catalog.manage'], '/admin/collections': ['catalog.manage'],
  '/admin/settings/variant-presets': ['catalog.manage'], '/admin/locations': ['locations.read'], '/admin/inventory': ['stock.read'],
  '/admin/pos': ['pos.sell'], '/admin/catering': ['catering.manage'], '/admin/devices': ['devices.self', 'devices.manage'],
  '/admin/users': ['users.manage'], '/admin/import': ['catalog.import'], '/admin/settings': ['settings.manage'],
};

export function canAccessStaffRoute(user: StaffAccessUser | null, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const required = ROUTE_CAPABILITIES[path] || (/^\/admin\/products\/[^/]+\/edit$/.test(path) ? ['catalog.manage'] as StaffCapability[] : null);
  // Do not let a known parent route implicitly admit future privileged children.
  if (!required) return user?.role === 'owner' && hasStaffCapability(user, 'account.self');
  return required.some(capability => hasStaffCapability(user, capability));
}

/** Null means no redirect. Query context is retained by the shell's Navigate. */
export function staffRootRedirect(user: StaffAccessUser | null, pathname: string): string | null {
  return pathname.replace(/\/+$/, '') === '/admin' && user?.role === 'staff' && canAccessStaffRoute(user, '/admin/orders/pickup-queue')
    ? '/admin/orders/pickup-queue' : null;
}

export function deviceLocations(user: StaffAccessUser | null): StaffLocation[] {
  if (!user || needsLocationAssignment(user) || user.operational_scope === 'none') return [];
  return user.operational_scope === 'specific'
    ? user.authorized_locations.filter(location => location.id === user.assigned_location_id)
    : user.authorized_locations;
}

export function canAssignDeviceLocation(user: StaffAccessUser | null, locationId: number | null): boolean {
  if (!hasStaffCapability(user, 'devices.self') && !hasStaffCapability(user, 'devices.manage')) return false;
  if (locationId === null) return user?.operational_scope === 'all' && user.role !== 'staff';
  return deviceLocations(user).some(location => location.id === locationId);
}

export function deviceReadPaths(user: StaffAccessUser | null): string[] {
  const self = hasStaffCapability(user, 'devices.self') || hasStaffCapability(user, 'devices.manage');
  return self ? [...(hasStaffCapability(user, 'devices.manage') ? ['/admin/devices'] : []), '/admin/devices/current'] : [];
}
