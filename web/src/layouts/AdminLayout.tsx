import { useRef, useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { ChevronLeft, ChevronRight, ExternalLink, Menu, X } from 'lucide-react';
import AdminIcon from '../components/admin/AdminIconMap';
import Dialog from '../components/ui/Dialog';
import { authGet } from '../services/authApi';

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

// --- Route metadata for breadcrumbs + titles ---
interface RouteMeta {
  title: string;
  parent?: string; // parent path for breadcrumb chain
}

const ROUTE_META: Record<string, RouteMeta> = {
  '/admin':                          { title: 'Dashboard' },
  '/admin/orders':                   { title: 'Orders',           parent: '/admin' },
  '/admin/orders/pickup-queue':      { title: 'Pickup Queue',     parent: '/admin/orders' },
  '/admin/orders/shipping-queue':    { title: 'Shipping Queue',   parent: '/admin/orders' },
  '/admin/products':                 { title: 'Products',         parent: '/admin' },
  '/admin/products/new':             { title: 'New Product',      parent: '/admin/products' },
  '/admin/collections':              { title: 'Collections',      parent: '/admin' },
  '/admin/locations':                { title: 'Locations',        parent: '/admin' },
  '/admin/inventory':                { title: 'Inventory',        parent: '/admin' },
  '/admin/analytics':                { title: 'Analytics',        parent: '/admin' },
  '/admin/catering':                 { title: 'Catering',         parent: '/admin' },
  '/admin/devices':                  { title: 'Devices',          parent: '/admin' },
  '/admin/users':                    { title: 'Users',            parent: '/admin' },
  '/admin/import':                   { title: 'CSV Import',       parent: '/admin' },
  '/admin/settings':                 { title: 'Settings',         parent: '/admin' },
  '/admin/settings/variant-presets': { title: 'Variant Presets',   parent: '/admin/settings' },
};

// Dynamic route matching for paths like /admin/products/:id/edit
function getRouteMeta(pathname: string): RouteMeta {
  // Exact match first
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  
  // Dynamic patterns
  if (/^\/admin\/products\/\d+\/edit$/.test(pathname))
    return { title: 'Edit Product', parent: '/admin/products' };
  
  // Fallback
  return { title: '', parent: '/admin' };
}

interface Crumb {
  label: string;
  path?: string;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [];
  let current = pathname;
  
  // Walk up the parent chain
  while (current) {
    const meta = getRouteMeta(current);
    if (!meta.title) break;
    crumbs.unshift({ label: meta.title, path: current });
    current = meta.parent || '';
  }
  
  // Last crumb is current page (no link)
  if (crumbs.length > 0) {
    delete crumbs[crumbs.length - 1].path;
  }
  
  return crumbs;
}

const NAVIGATION: { title: string; items: NavItem[] }[] = [
  { title: 'Main', items: [
    { name: 'Dashboard', path: '/admin', icon: 'dashboard' },
    { name: 'Orders', path: '/admin/orders', icon: 'orders' },
    { name: 'Products', path: '/admin/products', icon: 'products' },
    { name: 'Collections', path: '/admin/collections', icon: 'collections' },
    { name: 'Locations', path: '/admin/locations', icon: 'locations' },
    { name: 'Inventory', path: '/admin/inventory', icon: 'inventory' },
    { name: 'Analytics', path: '/admin/analytics', icon: 'analytics' },
  ] },
  { title: 'Special', items: [
    { name: 'POS Mode', path: '/admin/pos', icon: 'pos' },
    { name: 'Catering', path: '/admin/catering', icon: 'catering' },
    { name: 'Pickup Queue', path: '/admin/orders/pickup-queue', icon: 'pickup_queue' },
    { name: 'Shipping Queue', path: '/admin/orders/shipping-queue', icon: 'shipping_queue' },
  ] },
  { title: 'System', items: [
    { name: 'Devices', path: '/admin/devices', icon: 'devices' },
    { name: 'Users', path: '/admin/users', icon: 'users' },
    { name: 'Import', path: '/admin/import', icon: 'import' },
    { name: 'Settings', path: '/admin/settings', icon: 'settings' },
    { name: 'Variant Presets', path: '/admin/settings/variant-presets', icon: 'presets' },
  ] },
];

export default function AdminLayout() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [tooltip, setTooltip] = useState<{ name: string; top: number; left: number } | null>(null);
  const accessRequest = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    let next = !window.matchMedia('(min-width: 1280px)').matches;
    try {
      const saved = localStorage.getItem(`ts-admin-sidebar-collapsed:${user.id}`);
      if (saved === '0' || saved === '1') next = saved === '1';
    } catch { /* Native navigation still works with storage blocked. */ }
    setCollapsed(next);
  }, [isLoaded, user?.id]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    setTooltip(null);
    try { if (user?.id) localStorage.setItem(`ts-admin-sidebar-collapsed:${user.id}`, next ? '1' : '0'); }
    catch { /* Preference is optional; the current layout is still updated. */ }
  };

  const checkAccess = useCallback(async () => {
    if (!isLoaded) return;
    const id = ++accessRequest.current;
    setCheckingAdmin(true);
    if (!user) { setAccessError(false); setIsAdmin(false); setCheckingAdmin(false); return; }
    try {
      const response = await authGet<{ admin: boolean }>('/me', getToken, { timeout: 20000 });
      if (id !== accessRequest.current) return;
      setIsAdmin(response.data.admin === true);
      setAccessError(false);
    } catch {
      if (id !== accessRequest.current) return;
      setAccessError(true);
    } finally {
      if (id === accessRequest.current) setCheckingAdmin(false);
    }
  }, [isLoaded, user, getToken]);

  useEffect(() => {
    void checkAccess();
    return () => { accessRequest.current += 1; };
  }, [checkAccess]);

  useEffect(() => {
    if (!checkingAdmin && !accessError && isAdmin === false) navigate('/');
  }, [checkingAdmin, accessError, isAdmin, navigate]);

  useEffect(() => {
    setSidebarOpen(false);
    setTooltip(null);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (media.matches) setSidebarOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  if (accessError) return <main className="min-h-dvh bg-gray-50 p-6">
    <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-gray-300 bg-white p-6">
      <h1 className="text-xl font-bold">Admin access unavailable</h1>
      <p>We couldn’t check your access. Try again to continue where you left off.</p>
      <button type="button" disabled={checkingAdmin} onClick={checkAccess} className="btn-primary min-h-11">{checkingAdmin ? 'Checking…' : 'Retry access check'}</button>
    </div>
  </main>;
  if (!isLoaded || checkingAdmin) return <div role="status" className="min-h-dvh bg-gray-50 p-6">Checking admin access…</div>;
  if (!isAdmin) return null;

  const activePath = NAVIGATION.flatMap(group => group.items)
    .filter(item => location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const pageTitle = breadcrumbs.at(-1)?.label || 'Admin';
  const showTooltip = (target: HTMLElement, name: string) => {
    const rect = target.getBoundingClientRect();
    setTooltip({ name, top: Math.min(window.innerHeight - 48, Math.max(8, rect.top)), left: rect.right + 12 });
  };
  // Render native link elements directly so tooltip state never remounts the
  // navigation subtree or removes keyboard focus.
  const renderNavigation = (compact: boolean) => NAVIGATION.map(group => <div key={group.title} className="mb-5">
    <p className={`mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${compact ? 'sr-only' : ''}`}>{group.title}</p>
    <div className="space-y-1">{group.items.map(item => <Link
      key={item.path} to={item.path} aria-label={item.name} aria-current={activePath === item.path ? 'page' : undefined}
      onClick={() => { setSidebarOpen(false); setTooltip(null); }}
      onFocus={event => { if (compact) showTooltip(event.currentTarget, item.name); }}
      onBlur={() => setTooltip(null)}
      onMouseEnter={event => { if (compact) showTooltip(event.currentTarget, item.name); }}
      onMouseLeave={() => setTooltip(null)}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tsPrimary ${compact ? 'justify-center' : ''} ${activePath === item.path ? 'bg-tsPrimary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
    ><AdminIcon name={item.icon} className="h-5 w-5 shrink-0" /><span className={`text-sm font-medium ${compact ? 'sr-only' : ''}`}>{item.name}</span></Link>)}</div>
  </div>);
  const account = (compact: boolean) => <div className={`flex items-center gap-3 border-t border-gray-200 bg-gray-50 p-3 ${compact ? 'justify-center' : ''}`}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tsPrimary font-bold text-white" aria-hidden="true">{user?.firstName?.charAt(0) || 'A'}</span>
    <div className={`min-w-0 ${compact ? 'sr-only' : ''}`}><p className="truncate text-sm font-semibold text-gray-900">{user?.firstName || 'Admin'}</p><p className="text-xs text-gray-600">Administrator</p></div>
  </div>;

  return <div className="admin-scope min-h-dvh bg-gray-100">
    <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded focus:bg-white focus:p-3">Skip to content</a>
    <aside id="admin-sidebar" aria-label="Admin sidebar" className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-gray-200 bg-white md:flex ${collapsed ? 'w-20' : 'w-64'}`}>
      <Link to="/admin" aria-label="Three Squares Admin" className="flex h-16 shrink-0 items-center justify-center bg-tsPrimary px-3 text-lg font-bold text-white">{collapsed ? 'TS' : 'Three Squares Admin'}</Link>
      <nav aria-label="Admin navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" onScroll={event => {
        const focused = document.activeElement;
        if (collapsed && focused instanceof HTMLElement && event.currentTarget.contains(focused)) {
          const name = focused.getAttribute('aria-label');
          if (name) showTooltip(focused, name);
        } else setTooltip(null);
      }}>{renderNavigation(collapsed)}</nav>
      {account(collapsed)}
    </aside>
    {tooltip && collapsed && <div role="tooltip" className="pointer-events-none fixed z-60 rounded-lg bg-gray-950 px-3 py-2 text-sm font-medium text-white shadow-lg" style={{ top: tooltip.top, left: tooltip.left }}>{tooltip.name}</div>}
    <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen} labelledBy="admin-navigation-title" initialFocusRef={closeButton} returnFocusRef={menuButton} className="fixed inset-y-0 left-0 m-0! h-dvh max-h-none! w-[min(88vw,20rem)] max-w-none! rounded-none">
      <div id="admin-mobile-navigation" className="flex h-full flex-col bg-white">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-4"><h2 id="admin-navigation-title" className="font-bold">Three Squares Admin</h2><button ref={closeButton} type="button" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} className="btn-icon min-h-11 min-w-11"><X className="h-5 w-5" /></button></div>
        <nav aria-label="Admin navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{renderNavigation(false)}</nav>
        {account(false)}
      </div>
    </Dialog>
    <div className={collapsed ? 'md:pl-20' : 'md:pl-64'}>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
        <button ref={menuButton} type="button" aria-label="Open admin navigation" aria-expanded={sidebarOpen} aria-controls="admin-mobile-navigation" onClick={() => setSidebarOpen(true)} className="btn-icon min-h-11 min-w-11 md:hidden"><Menu className="h-6 w-6" /></button>
        <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="admin-sidebar" onClick={toggleCollapse} className="btn-icon hidden min-h-11 min-w-11 md:inline-flex">{collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}</button>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 md:flex">{breadcrumbs.map((crumb, index) => <span key={crumb.path || pageTitle} className="flex min-w-0 items-center gap-1.5">{index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />}{crumb.path ? <Link to={crumb.path} className="truncate text-sm text-gray-600 hover:text-tsPrimary">{crumb.label}</Link> : <span aria-current="page" className="truncate text-sm font-semibold text-gray-900">{crumb.label}</span>}</span>)}</nav>
        <Link to="/" className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-50 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"><ExternalLink className="h-4 w-4" />View Store</Link>
      </header>
      {/* Routine operational navigation uses native scroll and immediate content. */}
      <main id="admin-main" tabIndex={-1} className="p-4 xl:p-8"><Outlet /></main>
    </div>
  </div>;
}
