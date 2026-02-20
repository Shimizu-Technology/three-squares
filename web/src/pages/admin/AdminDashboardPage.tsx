import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import {
  DollarSign, ShoppingCart, Users, TrendingUp, ArrowRight,
  Package, MapPin, BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { SkeletonDashboard } from '../../components/admin';
import { authGet } from '../../services/authApi';

/* ────────────────────── Types ────────────────────── */

interface SummaryData {
  total_revenue: number;
  total_orders: number;
  average_order_value: number;
  total_customers: number;
}

interface LocationData {
  location_id: number | null;
  location_name: string;
  revenue: number;
  orders: number;
  average_order_value: number;
}

interface BreakdownEntry { count: number; revenue: number; }

interface TrendPoint { date: string; revenue: number; orders: number; }

interface TopProduct { id: number; name: string; quantity_sold: number; revenue: number; }

interface RecentOrder {
  id: number;
  order_number: string;
  total: number;
  status: string;
  location_name: string;
  created_at: string;
}

interface LocationOption { id: number; name: string; }

interface DashboardData {
  summary: SummaryData;
  by_location: LocationData[];
  by_order_type: Record<string, BreakdownEntry>;
  by_source: Record<string, BreakdownEntry>;
  revenue_trend: TrendPoint[];
  top_products: TopProduct[];
  recent_orders: RecentOrder[];
}

/* ────────────────────── Helpers ────────────────────── */

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
] as const;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const formatShortDate = (dateString: string) =>
  new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  ready: 'bg-emerald-100 text-emerald-800',
  shipped: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

const ORDER_TYPE_LABELS: Record<string, string> = {
  retail: 'Retail', wholesale: 'Wholesale', pickup: 'Pickup', dine_in: 'Dine-In',
};

const SOURCE_LABELS: Record<string, string> = {
  online: 'Online', pos: 'POS', phone: 'Phone',
};

/* ────────────────────── Components ────────────────────── */

function SummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function BreakdownPie({ data, labels, title }: {
  data: Record<string, BreakdownEntry>; labels: Record<string, string>; title: string;
}) {
  const chartData = Object.entries(data).map(([key, val]) => ({
    name: labels[key] || key,
    value: val.revenue,
    count: val.count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400 text-center py-8">No data</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1">
        {chartData.map((entry, i) => (
          <div key={entry.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-gray-600">{entry.name}</span>
            </div>
            <span className="font-semibold text-gray-900">{entry.count} orders · {formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────── Main Page ────────────────────── */

export default function AdminDashboardPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('month');
  const [locationId, setLocationId] = useState<string>('');
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Fetch locations once
  useEffect(() => {
    authGet<LocationOption[]>('/locations', getToken).then((res) => {
      setLocations(res.data);
    }).catch(() => {});
  }, []);

  // Fetch dashboard data when filters change
  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { period };
    if (locationId) params.location_id = locationId;

    authGet<DashboardData>('/admin/analytics/dashboard', getToken, { params })
      .then((res) => setData(res.data))
      .catch((err) => console.error('Failed to fetch analytics:', err))
      .finally(() => setLoading(false));
  }, [period, locationId]);

  // Max revenue for location progress bars
  const maxLocationRevenue = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.by_location.map((l) => l.revenue), 1);
  }, [data]);

  if (loading && !data) return <SkeletonDashboard />;

  const d = data!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Business overview and key metrics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Period selector */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  period === p.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Location filter */}
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="text-center text-sm text-gray-400 py-1">Updating…</div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Revenue" value={formatCurrency(d.summary.total_revenue)} icon={DollarSign} color="bg-green-50 text-green-600" />
        <SummaryCard label="Total Orders" value={d.summary.total_orders} icon={ShoppingCart} color="bg-blue-50 text-blue-600" />
        <SummaryCard label="Avg Order Value" value={formatCurrency(d.summary.average_order_value)} icon={TrendingUp} color="bg-indigo-50 text-indigo-600" />
        <SummaryCard label="Customers" value={d.summary.total_customers} icon={Users} color="bg-purple-50 text-purple-600" />
      </div>

      {/* Location Breakdown */}
      {!locationId && d.by_location.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Revenue by Location</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {d.by_location.map((loc) => (
              <div key={loc.location_id ?? 'none'} className="border border-gray-100 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-2 truncate">{loc.location_name}</h3>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-xl font-bold text-gray-900">{formatCurrency(loc.revenue)}</span>
                  <span className="text-xs text-gray-500">{loc.orders} orders · {formatCurrency(loc.average_order_value)} AOV</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(loc.revenue / maxLocationRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Trend Chart */}
      {d.revenue_trend.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Revenue Trend</h2>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={d.revenue_trend} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                formatter={(value, name) => [
                  name === 'revenue' ? formatCurrency(Number(value)) : value,
                  name === 'revenue' ? 'Revenue' : 'Orders',
                ]}
                labelFormatter={(label) => formatShortDate(String(label))}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revenueGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Order Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPie data={d.by_order_type} labels={ORDER_TYPE_LABELS} title="By Order Type" />
        <BreakdownPie data={d.by_source} labels={SOURCE_LABELS} title="By Source" />
      </div>

      {/* Top Products */}
      {d.top_products.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Top Products</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium text-right">Qty Sold</th>
                <th className="px-5 py-3 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {d.top_products.map((product, i) => (
                <tr key={product.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-5 py-3 font-medium text-gray-900">{product.name}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{product.quantity_sold}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(product.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900">Recent Orders</h2>
          <Link to="/admin/orders" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {d.recent_orders.length === 0 ? (
          <div className="text-center py-12 px-6">
            <ShoppingCart className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-50">
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_orders.map((order, i) => (
                  <tr key={order.id} className={`hover:bg-gray-50 transition ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                    <td className="px-5 py-3">
                      <Link to={`/admin/orders?id=${order.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{order.location_name}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3 text-right text-gray-500 text-xs">{formatDate(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
