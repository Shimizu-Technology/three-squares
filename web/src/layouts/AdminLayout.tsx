import { useRef, useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, ExternalLink, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminIcon from '../components/admin/AdminIconMap';

import { API_BASE_URL } from '../config';

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

export default function AdminLayout() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTabletSidebarCollapsed, setIsTabletSidebarCollapsed] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const navScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    try {
      const key = `ts-admin-sidebar-collapsed:${user.id}`;
      const savedValue = localStorage.getItem(key);
      if (savedValue === "0") setIsTabletSidebarCollapsed(false);
      if (savedValue === "1") setIsTabletSidebarCollapsed(true);
    } catch (_error) {
      // no-op (localStorage may be unavailable in strict privacy modes)
    }
  }, [isLoaded, user?.id]);

  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    try {
      const key = `ts-admin-sidebar-collapsed:${user.id}`;
      localStorage.setItem(key, isTabletSidebarCollapsed ? "1" : "0");
    } catch (error) {
      console.warn("Unable to persist admin sidebar preference", error);
    }
  }, [isLoaded, user?.id, isTabletSidebarCollapsed]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!isLoaded) return;
      if (!user) {
        setCheckingAdmin(false);
        setIsAdmin(false);
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          setIsAdmin(false);
          return;
        }
        const response = await axios.get(`${API_BASE_URL}/api/v1/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsAdmin(response.data.admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };
    checkAdminStatus();
  }, [isLoaded, user, getToken]);

  useEffect(() => {
    if (!checkingAdmin && isAdmin === false) navigate('/');
  }, [checkingAdmin, isAdmin, navigate]);

  if (!isLoaded || checkingAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  // --- Navigation groups ---
  const mainNavigation: NavItem[] = [
    { name: 'Dashboard', path: '/admin', icon: 'dashboard' },
    { name: 'Orders',    path: '/admin/orders', icon: 'orders' },
    { name: 'Products',  path: '/admin/products', icon: 'products' },
    { name: 'Collections', path: '/admin/collections', icon: 'collections' },
    { name: 'Locations', path: '/admin/locations', icon: 'locations' },
    { name: 'Inventory', path: '/admin/inventory', icon: 'inventory' },
    { name: 'Analytics', path: '/admin/analytics', icon: 'analytics' },
  ];
  const specialNavigation: NavItem[] = [
    { name: 'Catering', path: '/admin/catering', icon: 'catering' },
    { name: 'Pickup Queue', path: '/admin/orders/pickup-queue', icon: 'pickup_queue' },
    { name: 'Shipping Queue', path: '/admin/orders/shipping-queue', icon: 'shipping_queue' },
  ];
  const systemNavigation: NavItem[] = [
    { name: 'Users',    path: '/admin/users', icon: 'users' },
    { name: 'Import',   path: '/admin/import', icon: 'import' },
    { name: 'Settings', path: '/admin/settings', icon: 'settings' },
    { name: 'Variant Presets', path: '/admin/settings/variant-presets', icon: 'presets' },
  ];

  const NavSection = ({ title, items }: { title: string; items: NavItem[] }) => (
    <div className="mb-6">
      <p className={`px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider ${isTabletSidebarCollapsed ? 'md:hidden lg:block' : ''}`}>{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/admin' && location.pathname.startsWith(item.path + '/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              title={isTabletSidebarCollapsed ? item.name : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${
                isTabletSidebarCollapsed ? 'md:justify-center md:px-2.5 lg:justify-start lg:px-4' : ''
              } ${
                isActive
                  ? 'bg-tsPrimary text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <AdminIcon name={item.icon} className="w-5 h-5" />
              <span className={`font-medium text-sm ${isTabletSidebarCollapsed ? 'md:hidden lg:inline' : ''}`}>{item.name}</span>
              {isActive && (
                <div className={`ml-auto w-1.5 h-1.5 bg-white rounded-full ${isTabletSidebarCollapsed ? 'md:hidden lg:block' : ''}`} />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );

  // --- Breadcrumbs ---
  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const pageTitle = breadcrumbs.length > 0
    ? breadcrumbs[breadcrumbs.length - 1].label
    : '';

  return (
    <div className="min-h-screen bg-gray-100 admin-scope">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-dvh md:h-screen ${isTabletSidebarCollapsed ? 'w-56 md:w-20 lg:w-64' : 'w-56 lg:w-64'} bg-white shadow-xl transform transition-[transform,width] duration-300 ease-in-out md:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center justify-between border-b border-gray-100 bg-linear-to-r from-tsPrimary to-tsPrimary/90 ${isTabletSidebarCollapsed ? 'px-3 md:px-2 lg:px-6' : 'px-6'}`}>
          <Link to="/admin" className="flex items-center gap-2">
            <span className={`text-xl font-bold text-white ${isTabletSidebarCollapsed ? 'md:hidden lg:inline' : ''}`}>Three Squares Admin</span>
            <span className={`text-xl font-bold text-white ${isTabletSidebarCollapsed ? 'hidden md:inline lg:hidden' : 'hidden'}`}>TS</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-white/80 hover:text-white p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-tsPrimary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          ref={navScrollRef}
          className={`overflow-y-auto flex-1 min-h-0 admin-sidebar-scroll overscroll-contain ${isTabletSidebarCollapsed ? 'p-2 md:p-2.5 lg:p-4' : 'p-4'}`}
          onWheel={(event) => {
            if (navScrollRef.current) {
              navScrollRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          <NavSection title="Main" items={mainNavigation} />
          <NavSection title="Special" items={specialNavigation} />
          <NavSection title="System" items={systemNavigation} />
        </nav>

        {/* Admin info */}
        <div className={`mt-auto border-t border-gray-100 bg-gray-50 ${isTabletSidebarCollapsed ? 'p-2.5 md:p-2.5 lg:p-4' : 'p-4'}`}>
          <div className={`flex items-center ${isTabletSidebarCollapsed ? 'md:justify-center lg:justify-start gap-3' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-tsPrimary to-tsPrimary/80 flex items-center justify-center text-white font-bold shadow-md">
              {user?.firstName?.charAt(0) || 'A'}
            </div>
            <div className={`flex-1 min-w-0 ${isTabletSidebarCollapsed ? 'md:hidden lg:block' : ''}`}>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.firstName || 'Admin'}
              </p>
              <p className="text-xs text-gray-500 truncate">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`transition-[padding] duration-300 ${isTabletSidebarCollapsed ? 'md:pl-20 lg:pl-64' : 'md:pl-56 lg:pl-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              <Menu className="w-6 h-6 text-gray-700" />
            </button>
            {/* Tablet sidebar collapse button */}
            <button
              onClick={() => setIsTabletSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex lg:hidden p-2 rounded-lg hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
              aria-label={isTabletSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isTabletSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isTabletSidebarCollapsed ? (
                <ChevronRight className="w-5 h-5 text-gray-700" />
              ) : (
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              )}
            </button>
          </div>

          {/* Breadcrumbs / Page title */}
          <div className="hidden md:flex items-center gap-1.5">
            {breadcrumbs.length > 1 ? (
              breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <span key={i} className="flex items-center gap-1.5">
                    {crumb.path ? (
                      <Link
                        to={crumb.path}
                        className="text-sm text-gray-500 hover:text-tsPrimary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-gray-900">
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                  </span>
                );
              })
            ) : (
              <span className="text-lg font-semibold text-gray-900">{pageTitle}</span>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-tsPrimary bg-gray-50 hover:bg-gray-100 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Store
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
