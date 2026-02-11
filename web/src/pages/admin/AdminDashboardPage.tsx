import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, DollarSign, Clock, Package, Plus, ClipboardList, FolderOpen, Settings,
  BarChart3, ArrowRight,
} from 'lucide-react';
import { StatCard, SkeletonDashboard } from '../../components/admin';
import { authGet } from '../../services/authApi';

interface DashboardStats {
  total_orders: number;
  total_revenue_cents: number;
  pending_orders: number;
  total_products: number;
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

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-indigo-100 text-indigo-800',
  processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  shipped: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function AdminDashboardPage() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total_orders: 0, total_revenue_cents: 0, pending_orders: 0, total_products: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        authGet<DashboardStats>('/admin/dashboard/stats', getToken),
        authGet<AdminOrdersListResponse>('/admin/orders', getToken, { params: { per_page: 8 } }),
      ]);

      setStats(statsRes.data);
      setRecentOrders(ordersRes.data.orders || []);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="rounded-2xl p-6 sm:p-8 shadow-lg bg-tsPrimary">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: '#ffffff' }}>Welcome back!</h1>
        <p style={{ color: '#ffffff', opacity: 0.9 }}>Here's what's happening with your store today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          label="Total Orders"
          value={stats.total_orders}
          icon={ShoppingCart}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Revenue"
          value={formatCurrency(stats.total_revenue_cents)}
          icon={DollarSign}
          iconColor="bg-green-50 text-green-600"
          valueColor="text-green-600"
        />
        <StatCard
          label="Pending"
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
          label="Products"
          value={stats.total_products}
          icon={Package}
          iconColor="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        <Link to="/admin/products/new" className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md hover:border-tsPrimary transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
          <div className="w-10 h-10 bg-tsSurface rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-tsPrimary/10 transition">
            <Plus className="w-5 h-5 text-gray-600 group-hover:text-tsPrimary transition" />
          </div>
          <p className="text-sm font-medium text-gray-700">Add Product</p>
        </Link>
        <Link to="/admin/orders" className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md hover:border-tsPrimary transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
          <div className="w-10 h-10 bg-tsSurface rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-tsPrimary/10 transition">
            <ClipboardList className="w-5 h-5 text-gray-600 group-hover:text-tsPrimary transition" />
          </div>
          <p className="text-sm font-medium text-gray-700">View Orders</p>
        </Link>
        <Link to="/admin/collections" className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md hover:border-tsPrimary transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
          <div className="w-10 h-10 bg-tsSurface rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-tsPrimary/10 transition">
            <FolderOpen className="w-5 h-5 text-gray-600 group-hover:text-tsPrimary transition" />
          </div>
          <p className="text-sm font-medium text-gray-700">Collections</p>
        </Link>
        <Link to="/admin/analytics" className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md hover:border-tsPrimary transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
          <div className="w-10 h-10 bg-tsSurface rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-tsPrimary/10 transition">
            <BarChart3 className="w-5 h-5 text-gray-600 group-hover:text-tsPrimary transition" />
          </div>
          <p className="text-sm font-medium text-gray-700">Analytics</p>
        </Link>
        <Link to="/admin/settings" className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md hover:border-tsPrimary transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
          <div className="w-10 h-10 bg-tsSurface rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-tsPrimary/10 transition">
            <Settings className="w-5 h-5 text-gray-600 group-hover:text-tsPrimary transition" />
          </div>
          <p className="text-sm font-medium text-gray-700">Settings</p>
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Recent Orders</h2>
          <Link to="/admin/orders" className="text-sm link-primary flex items-center gap-1">
            View All
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recentOrders.length === 0 ? (
            <div className="text-center py-12 px-6">
              <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Orders will appear here once customers start purchasing</p>
            </div>
          ) : (
            recentOrders.map((order) => (
              <Link
                key={order.id}
                to={`/admin/orders?id=${order.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded"
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
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')}
                  </span>
                  <div className="text-right">
                    <p className="font-bold text-gray-900 text-sm">{formatCurrency(order.total_cents)}</p>
                    <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
