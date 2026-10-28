import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { NavigationLink } from '../../components/ui/NavigationLink';
import { OrderStatusBadge } from '../../components/admin/orders/OrderStatusBadge';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { ActionTile } from '../../components/ui/ActionTile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  ShoppingCart, DollarSign, Clock, Package, Plus, ClipboardList, FolderOpen,
  BarChart3, ArrowRight,
} from 'lucide-react';
import { StatCard, SkeletonDashboard } from '../../components/admin';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { authGet } from '../../services/authApi';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';

interface DashboardStats {
  total_orders: number;
  total_revenue_cents: number;
  pending_orders: number;
  total_products: number;
  excluded_simulated_order_count?: number;
  business_line_breakdown?: Record<string, { orders: number; revenue_cents: number }>;
  fulfillment_breakdown?: Record<string, number>;
  location_breakdown?: Array<{ name: string; orders: number; revenue_cents: number }>;
}

interface RecentOrder {
  id: number;
  order_number: string;
  customer_name: string;
  total_cents: number;
  status: string;
  created_at: string;
}

interface AdminOrdersListResponse {
  orders: RecentOrder[];
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });


const BUSINESS_LINE_LABELS: Record<string, string> = {
  three_squares: 'Three Squares',
  latte_stone: 'Latte Stone',
  catering: 'Catering',
};

export default function AdminDashboardPage() {
  const { getToken } = useAuth();
  const { scopeLabel } = useStaffAccess();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        authGet<DashboardStats>('/admin/dashboard/stats', getToken),
        authGet<AdminOrdersListResponse>('/admin/orders', getToken, { params: { per_page: 8 } }),
      ]);
      if (id !== requestId.current) return;
      setStats(statsRes.data);
      setRecentOrders(ordersRes.data.orders);
      setLoadError(false);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('Failed to fetch dashboard data:', err);
      setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchDashboardData();
    return () => { requestId.current += 1; };
  }, [fetchDashboardData]);

  const requestState = <AdminRequestState resource="Dashboard" loading={loading} error={loadError} hasData={stats !== null} onRetry={fetchDashboardData} />;

  if (!stats) {
    return <div className="space-y-6">
      <AdminPageHeader title="Dashboard" />
      {requestState}
      {loading && <SkeletonDashboard />}
    </div>;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <AdminPageHeader title="Dashboard" subtitle={<>All-time order totals · {scopeLabel} · All business lines<br />Production, non-simulated orders only. Revenue is captured sales minus succeeded refunds. Published products are counted across all locations.</>} actions={<><IconButton aria-label="Refresh dashboard" type="button" onClick={fetchDashboardData} disabled={loading}><RefreshCw /></IconButton></>} />

      {requestState}

      {(stats.excluded_simulated_order_count ?? 0) > 0 && <aside role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p className="font-semibold">Simulated orders aren&apos;t counted in revenue</p>
        <p className="mt-1 text-sm">{stats.excluded_simulated_order_count} simulated {stats.excluded_simulated_order_count === 1 ? 'order' : 'orders'} in your location scope (all time). The totals below remain production-only; no simulated money is included.</p>
      </aside>}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          label="All-time orders"
          value={stats.total_orders}
          icon={ShoppingCart}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="All-time net revenue"
          value={formatCurrency(stats.total_revenue_cents)}
          icon={DollarSign}
          iconColor="bg-green-50 text-green-600"
          valueColor="text-green-600"
        />
        <StatCard
          label="Pending orders"
          value={stats.pending_orders}
          icon={Clock}
          iconColor="bg-orange-50 text-orange-600"
          valueColor="text-tsPrimary"
          link={
            stats.pending_orders > 0
              ? { text: 'View pending', to: '/admin/orders?status=pending' }
              : undefined
          }
        />
        <StatCard
          label="Published products (global)"
          value={stats.total_products}
          icon={Package}
          iconColor="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Quick Actions */}
      <nav aria-label="Quick actions" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <ActionTile to="/admin/products/new" icon={<Plus />}>Add Product</ActionTile>
        <ActionTile to="/admin/orders" icon={<ClipboardList />}>View Orders</ActionTile>
        <ActionTile to="/admin/collections" icon={<FolderOpen />}>Menus &amp; specials</ActionTile>
        <ActionTile to="/admin/analytics" icon={<BarChart3 />}>Analytics</ActionTile>
      </nav>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <div><h2 className="text-lg font-bold text-gray-900">Recent Orders</h2><p className="text-sm text-gray-600">{scopeLabel} · All business lines · Includes test and simulated orders</p></div>
          <NavigationLink context="admin" to="/admin/orders" className="gap-1">
            View All
            <ArrowRight className="w-4 h-4" />
          </NavigationLink>
        </div>
        <div className="divide-y divide-gray-50">
          {recentOrders.length === 0 ? (!loadError && !loading && (
            <div className="text-center py-12 px-6">
              <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Orders will appear here once customers start purchasing</p>
            </div>
          )) : (
            recentOrders.map((order) => (
              <NavigationLink context="admin"
                key={order.id}
                to={`/admin/orders?id=${order.id}`} record
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-600">
                    {order.customer_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{order.order_number}</p>
                    <p className="text-sm text-gray-500">{order.customer_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge order={order} />
                  <div className="text-right">
                    <p className="font-bold text-gray-900 text-sm">{formatCurrency(order.total_cents)}</p>
                    <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                  </div>
                </div>
              </NavigationLink>
            ))
          )}
        </div>
      </div>

      <p className="text-sm text-gray-700">Breakdowns: all time · {scopeLabel} · All business lines · Production, non-simulated orders. Revenue is captured sales minus succeeded refunds.</p>
      {/* Phase 2 Segmentation Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Business Line Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(stats.business_line_breakdown || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{BUSINESS_LINE_LABELS[key] || key}</span>
                <span className="font-semibold text-gray-900">
                  {value.orders} / {formatCurrency(value.revenue_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Fulfillment Mix</h3>
          <div className="space-y-2">
            {Object.entries(stats.fulfillment_breakdown || {}).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{key === 'pickup' ? 'Pickup' : 'Shipping'}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Locations</h3>
          <div className="space-y-2">
            {(stats.location_breakdown || []).slice(0, 5).map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 truncate pr-2">{entry.name}</span>
                <span className="font-semibold text-gray-900">
                  {entry.orders} / {formatCurrency(entry.revenue_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
