import axios from 'axios';
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Package, Filter, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { authGet } from '../../services/authApi';
import { format } from 'date-fns';

interface InventoryAudit {
  id: number;
  audit_type: string;
  quantity_change: number;
  formatted_change: string;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  created_at: string;
  display_name: string;
  user: string;
  variant?: {
    id: number;
    sku: string;
    display_name: string;
  };
  product?: {
    id: number;
    name: string;
  };
  order?: {
    id: number;
    order_number: string;
  };
}

interface Pagination {
  current_page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
}

interface Summary {
  total_audits: number;
  by_type: Record<string, number>;
  total_stock_added: number;
  total_stock_removed: number;
  orders_affecting_stock: number;
}

interface InventoryAuditsResponse {
  audits: InventoryAudit[];
  pagination: Pagination;
}

interface InventorySummaryResponse {
  summary: Summary;
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  order_placed: 'Order Placed',
  order_cancelled: 'Order Cancelled',
  order_refunded: 'Order Refunded',
  restock: 'Restock',
  manual_adjustment: 'Manual Adjustment',
  damaged: 'Damaged',
  import: 'CSV Import',
  variant_created: 'Variant Created',
  inventory_sync: 'Inventory Sync'
};

const AUDIT_TYPE_COLORS: Record<string, string> = {
  order_placed: 'bg-blue-100 text-blue-800',
  order_cancelled: 'bg-yellow-100 text-yellow-800',
  order_refunded: 'bg-orange-100 text-orange-800',
  restock: 'bg-green-100 text-green-800',
  manual_adjustment: 'bg-purple-100 text-purple-800',
  damaged: 'bg-red-100 text-red-800',
  import: 'bg-indigo-100 text-indigo-800',
  variant_created: 'bg-teal-100 text-teal-800',
  inventory_sync: 'bg-gray-100 text-gray-800'
};

export default function AdminInventoryPage() {
  const { getToken } = useAuth();
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [auditType, setAuditType] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadAudits();
    loadSummary();
  }, [page, auditType, dateRange]);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('per_page', '25');
      
      if (auditType) params.append('audit_type', auditType);
      if (dateRange.start) params.append('start_date', dateRange.start);
      if (dateRange.end) params.append('end_date', dateRange.end);

      const response = await authGet<InventoryAuditsResponse>(`/admin/inventory_audits?${params.toString()}`, getToken);
      
      setAudits(response.data.audits);
      setPagination(response.data.pagination);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to load inventory history' : 'Failed to load inventory history');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.start) params.append('start_date', dateRange.start);
      if (dateRange.end) params.append('end_date', dateRange.end);

      const response = await authGet<InventorySummaryResponse>(`/admin/inventory_audits/summary?${params.toString()}`, getToken);
      
      setSummary(response.data.summary);
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
  };

  const ChangeIndicator = ({ change }: { change: number }) => {
    if (change > 0) {
      return (
        <span className="inline-flex items-center text-green-600 font-medium">
          <ArrowUp className="w-4 h-4 mr-1" />
          +{change}
        </span>
      );
    } else if (change < 0) {
      return (
        <span className="inline-flex items-center text-red-600 font-medium">
          <ArrowDown className="w-4 h-4 mr-1" />
          {change}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-gray-500">
        <Minus className="w-4 h-4 mr-1" />
        0
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Package className="w-7 h-7 mr-3 text-tsPrimary" />
          Inventory History
        </h1>
        <p className="text-gray-600 mt-1">
          Track all inventory changes across products and orders
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total Changes</p>
            <p className="text-2xl font-bold text-gray-900">{summary.total_audits}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Stock Added</p>
            <p className="text-2xl font-bold text-green-600">+{summary.total_stock_added}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Stock Removed</p>
            <p className="text-2xl font-bold text-red-600">-{summary.total_stock_removed}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Orders Affecting Stock</p>
            <p className="text-2xl font-bold text-blue-600">{summary.orders_affecting_stock}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Change Type
            </label>
            <select
              value={auditType}
              onChange={(e) => { setAuditType(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
            >
              <option value="">All Types</option>
              {Object.entries(AUDIT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setAuditType(''); setDateRange({ start: '', end: '' }); setPage(1); }}
              className="w-full px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading inventory history...</p>
        </div>
      )}

      {/* Audits Table */}
      {!loading && audits.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product / Variant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {audits.map((audit) => (
                  <tr key={audit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(audit.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${AUDIT_TYPE_COLORS[audit.audit_type] || 'bg-gray-100 text-gray-800'}`}>
                        {AUDIT_TYPE_LABELS[audit.audit_type] || audit.audit_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {audit.product?.name || 'Unknown Product'}
                      </div>
                      {audit.variant && (
                        <div className="text-xs text-gray-500">
                          {audit.variant.display_name} ({audit.variant.sku})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ChangeIndicator change={audit.quantity_change} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {audit.previous_quantity} → {audit.new_quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {audit.reason}
                      {audit.order && (
                        <span className="ml-1 text-blue-600">
                          (#{audit.order.order_number})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {audit.user}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {((pagination.current_page - 1) * pagination.per_page) + 1} to{' '}
                {Math.min(pagination.current_page * pagination.per_page, pagination.total_count)} of{' '}
                {pagination.total_count} entries
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {pagination.current_page} of {pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pagination.total_pages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && audits.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Inventory Changes</h3>
          <p className="text-gray-600">
            Inventory changes will appear here when orders are placed or stock is adjusted.
          </p>
        </div>
      )}
    </div>
  );
}
