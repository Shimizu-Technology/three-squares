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

import { configApi } from '../../services/api';
import { authGet, authPatch, authPost } from '../../services/authApi';
import type { AppConfig } from '../../types/order';

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

export default function AdminOrdersPage() {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
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

  // ── Fetch orders ──────────────────────────────────────────────
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page, per_page: 25 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (orderTypeFilter !== 'all') params.order_type = orderTypeFilter;
      if (searchQuery) params.search = searchQuery;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

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

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter, orderTypeFilter, startDate, endDate]);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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

  // ── Render ────────────────────────────────────────────────────
  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">{totalCount}</span> total orders
          </p>
        </div>
      </div>

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
        orderTypeFilter={orderTypeFilter}
        onOrderTypeFilterChange={(v) => { setOrderTypeFilter(v); setPage(1); }}
        datePreset={datePreset}
        onDatePresetChange={updateDatePreset}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(value) => { setStartDate(value); setDatePreset('custom'); setPage(1); }}
        onEndDateChange={(value) => { setEndDate(value); setDatePreset('custom'); setPage(1); }}
      />

      {/* Fundraiser Orders Note */}
      {orderTypeFilter === 'wholesale' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800">Fundraiser orders are managed separately</p>
            <p className="text-sm text-blue-600 mt-1">
              To view and manage fundraiser orders, go to{' '}
              <a href="/admin/fundraisers" className="font-medium underline hover:text-blue-800">
                Fundraisers
              </a>{' '}
              → select a fundraiser → Orders tab.
            </p>
          </div>
        </div>
      )}

      {/* Orders List */}
      {loading ? (
        <SkeletonListPage />
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-500">Orders will appear here once customers start placing them.</p>
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
