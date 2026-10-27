import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { SkeletonBar, SkeletonStatCard } from '../../components/admin';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { authGet } from '../../services/authApi';

interface ChartPoint {
  date: string;
  label: string;
  orders: number;
  revenue_cents: number;
}

interface ChartData {
  series: ChartPoint[];
  comparison: {
    this_week: { orders: number; revenue_cents: number };
    last_week: { orders: number; revenue_cents: number };
  };
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AdminAnalyticsPage() {
  const { getToken } = useAuth();
  const [chartMode, setChartMode] = useState<'revenue' | 'orders'>('revenue');
  const [days, setDays] = useState(14);

  const [result, setResult] = useState<{ days: number; data: ChartData | null; loading: boolean; error: boolean }>({ days, data: null, loading: true, error: false });
  const requestId = useRef(0);

  const fetchChartData = useCallback(() => {
    const id = ++requestId.current;
    void authGet<ChartData>('/admin/dashboard/chart_data', getToken, { params: { days } }).then(
      (res) => {
        if (id !== requestId.current) return;
        setResult({ days, data: res.data, loading: false, error: false });
      },
      (err) => {
        if (id !== requestId.current) return;
        console.error('Failed to fetch chart data:', err);
        setResult((previous) => ({ days, data: previous.days === days ? previous.data : null, loading: false, error: true }));
      },
    );
  }, [days, getToken]);

  useEffect(() => {
    void fetchChartData();
    return () => { requestId.current += 1; };
  }, [fetchChartData]);

  const refreshChartData = () => {
    setResult((previous) => ({ ...previous, loading: true }));
    void fetchChartData();
  };

  const selectDays = (nextDays: number) => {
    if (nextDays === days) return;
    setResult((previous) => previous.days === nextDays
      ? { ...previous, loading: true }
      : { days: nextDays, data: null, loading: true, error: false });
    setDays(nextDays);
  };

  // A range change hides the previous range immediately, before the effect runs.
  const chartData = result.days === days ? result.data : null;
  const loading = result.days !== days || result.loading;
  const loadError = result.days === days && result.error;

  const comp = chartData?.comparison;
  const revenueChange = comp
    ? comp.last_week.revenue_cents > 0
      ? ((comp.this_week.revenue_cents - comp.last_week.revenue_cents) / comp.last_week.revenue_cents) * 100
      : comp.this_week.revenue_cents > 0 ? 100 : 0
    : null;
  const ordersChange = comp
    ? comp.last_week.orders > 0
      ? ((comp.this_week.orders - comp.last_week.orders) / comp.last_week.orders) * 100
      : comp.this_week.orders > 0 ? 100 : 0
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Revenue and order trends over time</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={refreshChartData} disabled={loading} className="btn-secondary min-h-[44px] disabled:opacity-60">Refresh analytics</button>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => selectDays(d)}
              aria-pressed={days === d}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                days === d
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        </div>
      </div>

      <AdminRequestState resource={`Analytics for the last ${days} days`} loading={loading} error={loadError} hasData={chartData !== null} onRetry={refreshChartData} />
      {loading && !chartData && <div className="space-y-4" aria-hidden="true">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
        <SkeletonBar className="h-96 rounded-xl" />
      </div>}

      {/* Week-over-Week Summary Cards */}
      {comp && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm font-medium text-gray-500">This Week Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(comp.this_week.revenue_cents)}
            </p>
            {revenueChange !== null && revenueChange !== 0 && (
              <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${
                revenueChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {revenueChange > 0 ? <TrendingUp className="w-4 h-4" /> :
                 revenueChange < 0 ? <TrendingDown className="w-4 h-4" /> :
                 <Minus className="w-4 h-4" />}
                {revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(0)}% vs last week
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm font-medium text-gray-500">Last Week Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(comp.last_week.revenue_cents)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm font-medium text-gray-500">This Week Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{comp.this_week.orders}</p>
            {ordersChange !== null && ordersChange !== 0 && (
              <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${
                ordersChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {ordersChange > 0 ? <TrendingUp className="w-4 h-4" /> :
                 ordersChange < 0 ? <TrendingDown className="w-4 h-4" /> :
                 <Minus className="w-4 h-4" />}
                {ordersChange > 0 ? '+' : ''}{ordersChange.toFixed(0)}% vs last week
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm font-medium text-gray-500">Last Week Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{comp.last_week.orders}</p>
          </div>
        </div>
      )}

      {/* Main Chart */}
      {chartData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Overview</h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setChartMode('revenue')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  chartMode === 'revenue'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setChartMode('orders')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  chartMode === 'orders'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Orders
              </button>
            </div>
          </div>
          {chartData.series.length === 0 ? (
            !loading && !loadError && <p className="py-12 text-center text-gray-600">No chart data for the last {days} days.</p>
          ) : <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData.series} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={chartMode === 'revenue' ? (v) => `$${(v / 100).toFixed(0)}` : undefined}
              />
              <Tooltip
                formatter={(value) => {
                  const v = Number(value);
                  return chartMode === 'revenue'
                    ? [formatCurrency(v), 'Revenue']
                    : [v, 'Orders'];
                }}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
              />
              <Bar
                dataKey={chartMode === 'revenue' ? 'revenue_cents' : 'orders'}
                fill={chartMode === 'revenue' ? '#16a34a' : '#C1191F'}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>}
        </div>
      )}
    </div>
  );
}
