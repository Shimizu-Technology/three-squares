import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import type { Order } from '../../components/admin/orders';
import {
  OrderFilters,
  OrdersTable,
  OrderDetailModal,
  ShipOrderModal,
  RefundModal,
  formatStatus,
} from '../../components/admin/orders';
import { SkeletonListPage } from '../../components/admin';

import { configApi, locationsApi } from '../../services/api';
import { authGet, authPatch, authPost } from '../../services/authApi';
import type { AppConfig } from '../../types/order';
import type { Location } from '../../services/api';

interface OrdersIndexResponse {
  orders: Order[];
  pagination: {
    total_pages: number;
    total_count: number;
  };
}

interface AdminOrderResponse {
  order: Order;
}

interface RefundResponse {
  order: Order;
  message?: string;
}

interface OrdersSummaryResponse {
  total_orders: number;
  paid_orders: number;
  total_revenue_cents: number;
  status_counts: Record<string, number>;
}

export default function AdminOrdersPage() {
  const mode: 'default' | 'pickup_queue' | 'shipping_queue' = 'default';
  return <AdminOrdersPageContent mode={mode} />;
}

interface AdminOrdersPageContentProps {
  mode: 'default' | 'pickup_queue' | 'shipping_queue';
}

export function AdminOrdersPageContent({ mode }: AdminOrdersPageContentProps) {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState(
    mode === 'pickup_queue' ? 'confirmed' : mode === 'shipping_queue' ? 'processing' : 'all'
  );
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [businessLineFilter, setBusinessLineFilter] = useState(mode === 'shipping_queue' ? 'latte_stone' : 'all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState(
    mode === 'pickup_queue' ? 'pickup' : mode === 'shipping_queue' ? 'shipping' : 'all'
  );
  const [locationFilter, setLocationFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const month = `${today.getMonth() + 1}`.padStart(2, '0');
    const day = `${today.getDate()}`.padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const month = `${today.getMonth() + 1}`.padStart(2, '0');
    const day = `${today.getDate()}`.padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  });

  // Selected order
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);

  // Ship modal
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipOrderId, setShipOrderId] = useState<number | null>(null);
  const [shipTrackingNumber, setShipTrackingNumber] = useState('');
  const [shipCarrier, setShipCarrier] = useState('');

  // Refund modal
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [processingRefund, setProcessingRefund] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<OrdersSummaryResponse | null>(null);

  const buildFilterParams = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (orderTypeFilter !== 'all') params.order_type = orderTypeFilter;
    if (businessLineFilter !== 'all') params.business_line = businessLineFilter;
    if (fulfillmentFilter !== 'all') params.fulfillment_type = fulfillmentFilter;
    if (locationFilter !== 'all') params.location_id = Number(locationFilter);
    if (searchQuery) params.search = searchQuery;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return params;
  };

  // ── Fetch orders ──────────────────────────────────────────────
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page, per_page: 25, ...buildFilterParams() };

      const response = await authGet<OrdersIndexResponse>('/orders', getToken, { params });

      setOrders(response.data.orders);
      setTotalPages(response.data.pagination.total_pages);
      setTotalCount(response.data.pagination.total_count);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const params = buildFilterParams();
      const response = await authGet<OrdersSummaryResponse>('/admin/orders/summary', getToken, { params });
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch order summary:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter, orderTypeFilter, businessLineFilter, fulfillmentFilter, locationFilter, startDate, endDate]);

  useEffect(() => {
    fetchSummary();
  }, [statusFilter, orderTypeFilter, businessLineFilter, fulfillmentFilter, locationFilter, startDate, endDate]);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  useEffect(() => {
    locationsApi
      .getLocations()
      .then((response) => setLocations(response.locations || []))
      .catch((error) => {
        console.error('Failed to load locations for filters:', error);
      });
  }, []);

  useEffect(() => {
    if (mode === 'pickup_queue') {
      setFulfillmentFilter('pickup');
      setStatusFilter('confirmed');
    } else if (mode === 'shipping_queue') {
      setFulfillmentFilter('shipping');
      setStatusFilter('processing');
    }
  }, [mode]);

  // ── Fetch single order details ────────────────────────────────
  const fetchOrderDetails = async (orderId: number) => {
    try {
      const response = await authGet<AdminOrderResponse>(`/admin/orders/${orderId}`, getToken);
      setSelectedOrder(response.data.order);
    } catch (err) {
      console.error('Failed to fetch order details:', err);
      toast.error('Failed to load order details');
    }
  };

  // ── Update order (from detail modal edit form) ────────────────
  const updateOrder = async (updates: {
    status: string;
    tracking_number: string | null;
    admin_notes: string | null;
  }) => {
    if (!selectedOrder) return;
    try {
      setSaving(true);
      const response = await authPatch<AdminOrderResponse>(`/admin/orders/${selectedOrder.id}`, { order: updates }, getToken);
      setOrders(orders.map((o) => (o.id === selectedOrder.id ? response.data.order : o)));
      setSelectedOrder(response.data.order);
      toast.success('Order updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  // ── Quick status update ───────────────────────────────────────
  const quickUpdateStatus = async (orderId: number, newStatus: string) => {
    if (newStatus === 'shipped') {
      setShipOrderId(orderId);
      setShipTrackingNumber('');
      setShipCarrier('');
      setShowShipModal(true);
      return;
    }

    try {
      const response = await authPatch<AdminOrderResponse>(`/admin/orders/${orderId}`, { order: { status: newStatus } }, getToken);
      setOrders(orders.map((o) => (o.id === orderId ? response.data.order : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(response.data.order);
      toast.success(`Order marked as ${formatStatus(newStatus)}!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  // ── Ship order ────────────────────────────────────────────────
  const shipOrder = async () => {
    if (!shipOrderId) return;
    try {
      setSaving(true);
      const trackingInfo =
        shipCarrier && shipTrackingNumber
          ? `${shipCarrier}: ${shipTrackingNumber}`
          : shipTrackingNumber;

      const response = await authPatch<AdminOrderResponse>(
        `/admin/orders/${shipOrderId}`,
        { order: { status: 'shipped', tracking_number: trackingInfo || null } },
        getToken
      );

      setOrders(orders.map((o) => (o.id === shipOrderId ? response.data.order : o)));
      if (selectedOrder?.id === shipOrderId) setSelectedOrder(response.data.order);
      setShowShipModal(false);
      setShipOrderId(null);
      toast.success('Order shipped! Customer will receive a notification email.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ship order');
    } finally {
      setSaving(false);
    }
  };

  // ── Process refund ────────────────────────────────────────────
  const processRefund = async (amountCents: number, reason: string) => {
    if (!selectedOrder || amountCents <= 0) {
      toast.error('Invalid refund amount');
      return;
    }
    try {
      setProcessingRefund(true);
      const response = await authPost<RefundResponse>(
        `/admin/orders/${selectedOrder.id}/refund`,
        { amount_cents: amountCents, reason: reason || undefined },
        getToken
      );
      toast.success(response.data.message || 'Refund processed successfully');
      const updatedOrder = response.data.order;
      setSelectedOrder(updatedOrder);
      setOrders(orders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      setShowRefundModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.details || 'Failed to process refund');
    } finally {
      setProcessingRefund(false);
    }
  };

  // ── Resend notification ───────────────────────────────────────
  const resendNotification = async (orderId: number) => {
    try {
      await authPost(`/admin/orders/${orderId}/notify`, {}, getToken);
      toast.success('Notification email sent to customer!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send notification');
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchOrders();
  };

  const updateDatePreset = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    const format = (date: Date) => {
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };

    if (preset === 'today') {
      const todayString = format(today);
      setStartDate(todayString);
      setEndDate(todayString);
      setPage(1);
      return;
    }

    if (preset === 'last_7_days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      setStartDate(format(start));
      setEndDate(format(today));
      setPage(1);
      return;
    }

    if (preset === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(format(start));
      setEndDate(format(end));
      setPage(1);
      return;
    }

    if (preset === 'all_time') {
      setStartDate('');
      setEndDate('');
      setPage(1);
    }
  };

  const exportOrdersCsv = async () => {
    try {
      setExporting(true);

      const params: Record<string, unknown> = {};
      Object.assign(params, buildFilterParams());

      const response = await authGet<Blob>('/admin/orders/export', getToken, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const contentDisposition = response.headers['content-disposition'] as string | undefined;
      const fileNameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const fileName = fileNameMatch?.[1] || `orders-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('CSV export started');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';
  const pageTitle = mode === 'pickup_queue' ? 'Pickup Queue' : mode === 'shipping_queue' ? 'Shipping Queue' : 'Orders';
  const pageSubtitle = mode === 'pickup_queue'
    ? 'Operational queue for pickup-ready and pickup-confirmation workflows.'
    : mode === 'shipping_queue'
      ? 'Operational queue for shipping fulfillment and handoff workflows.'
      : `${totalCount} total orders`;
  const queueStatusOptions = mode === 'pickup_queue'
    ? [ 'pending', 'confirmed', 'ready', 'picked_up' ]
    : mode === 'shipping_queue'
      ? [ 'pending', 'processing', 'shipped', 'delivered' ]
      : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'default' ? (
              <>
                <span className="font-semibold text-gray-700">{totalCount}</span> total orders
              </>
            ) : (
              pageSubtitle
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exportOrdersCsv}
          disabled={exporting}
          className="px-4 py-2.5 text-sm font-semibold border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {queueStatusOptions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
          {queueStatusOptions.map((status) => {
            const count = summary?.status_counts?.[status] || 0;
            return (
              <button
                key={status}
                type="button"
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`px-3 py-2 rounded-lg text-sm border transition ${
                  statusFilter === status
                    ? 'bg-tsPrimary text-white border-tsPrimary'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {formatStatus(status)} ({count})
              </button>
            );
          })}
          <div className="ml-auto text-sm text-gray-600 flex items-center gap-4">
            <span>Total: <span className="font-semibold text-gray-900">{summary?.total_orders || 0}</span></span>
            <span>Paid: <span className="font-semibold text-gray-900">{summary?.paid_orders || 0}</span></span>
          </div>
        </div>
      )}

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
        orderTypeFilter={orderTypeFilter}
        onOrderTypeFilterChange={(v) => { setOrderTypeFilter(v); setPage(1); }}
        businessLineFilter={businessLineFilter}
        onBusinessLineFilterChange={(v) => { setBusinessLineFilter(v); setPage(1); }}
        fulfillmentFilter={fulfillmentFilter}
        onFulfillmentFilterChange={(v) => { setFulfillmentFilter(v); setPage(1); }}
        locationFilter={locationFilter}
        onLocationFilterChange={(v) => { setLocationFilter(v); setPage(1); }}
        locationOptions={locations.map((location) => ({ id: location.id, name: location.name }))}
        datePreset={datePreset}
        onDatePresetChange={updateDatePreset}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(value) => { setStartDate(value); setDatePreset('custom'); setPage(1); }}
        onEndDateChange={(value) => { setEndDate(value); setDatePreset('custom'); setPage(1); }}
      />

      {/* Orders List */}
      {loading ? (
        <SkeletonListPage />
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {mode === 'default' ? 'No orders yet' : 'No matching queue orders'}
          </h3>
          <p className="text-gray-500">
            {mode === 'default'
              ? 'Orders will appear here once customers start placing them.'
              : 'Try adjusting status, location, or business line filters.'}
          </p>
        </div>
      ) : (
        <OrdersTable
          orders={orders}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onQuickUpdateStatus={quickUpdateStatus}
          onViewDetails={fetchOrderDetails}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          saving={saving}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={updateOrder}
          onQuickUpdateStatus={quickUpdateStatus}
          onResendNotification={resendNotification}
          onOpenRefundModal={() => setShowRefundModal(true)}
          storeEmail={storeEmail}
        />
      )}

      {/* Ship Order Modal */}
      {showShipModal && (
        <ShipOrderModal
          saving={saving}
          carrier={shipCarrier}
          trackingNumber={shipTrackingNumber}
          onCarrierChange={setShipCarrier}
          onTrackingChange={setShipTrackingNumber}
          onShip={shipOrder}
          onClose={() => { setShowShipModal(false); setShipOrderId(null); }}
        />
      )}

      {/* Refund Modal */}
      {showRefundModal && selectedOrder && (
        <RefundModal
          order={selectedOrder}
          processing={processingRefund}
          onProcess={processRefund}
          onClose={() => setShowRefundModal(false)}
        />
      )}
    </div>
  );
}
