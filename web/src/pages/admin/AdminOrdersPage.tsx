import axios from 'axios';
import { savedRefundRequest, prepareRefundRequest, clearRefundRequest, rememberRefundOperation, type SavedRefundRequest } from '../../lib/refundRequest';
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import PickupPackingList from '../../components/admin/orders/PickupPackingList';
import ShippingPackingList from '../../components/admin/orders/ShippingPackingList';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import { orderBusinessDate, orderDateRange, orderListContext, parseOrderQuery, serializeOrderQuery, updateOrderQuery, type OrderDatePreset, type OrderPageMode, type OrderQueryState } from '../../components/admin/orders/orderQueryState';
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
  message?: string;
}

interface RefundResponse {
  status: string;
  operation_uuid?: string;
  success: boolean;
  inventory_restoration_required?: boolean;
  restoration_status?: string;
  order: Order;
  message?: string;
}

interface OrdersSummaryResponse {
  total_orders: number;
  paid_orders: number;
  total_revenue_cents?: number;
  status_counts: Record<string, number>;
  queue_stage_counts: Record<string, number>;
}

export default function AdminOrdersPage() {
  const mode: 'default' | 'pickup_queue' | 'shipping_queue' = 'default';
  return <AdminOrdersPageContent mode={mode} />;
}

interface AdminOrdersPageContentProps {
  mode: OrderPageMode;
}

export function AdminOrdersPageContent({ mode }: AdminOrdersPageContentProps) {
  const access = useStaffAccess();
  const locations = access.user?.authorized_locations || [];
  const { getToken, userId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [clock, setClock] = useState(Date.now);
  const businessDay = orderBusinessDate(new Date(clock));
  const businessNow = useMemo(() => new Date(`${businessDay}T12:00:00+10:00`), [businessDay]);
  const queryState = useMemo(() => parseOrderQuery(location.search, mode, businessNow), [location.search, mode, businessNow]);
  const canonicalSearch = serializeOrderQuery(queryState);
  const queryStateRef = useRef(queryState);
  useLayoutEffect(() => { queryStateRef.current = queryState; }, [queryState]);
  const changeQuery = useCallback((changes: Partial<OrderQueryState>, replace = false) => {
    const next = updateOrderQuery(queryStateRef.current, changes, mode, businessNow);
    if (serializeOrderQuery(next) === serializeOrderQuery(queryStateRef.current)) return;
    queryStateRef.current = next;
    void navigate({ search: `?${serializeOrderQuery(next)}` }, { replace, preventScrollReset: true });
  }, [mode, navigate, businessNow]);
  useEffect(() => {
    if (location.search.slice(1) !== canonicalSearch) {
      void navigate({ search: `?${canonicalSearch}` }, { replace: true, preventScrollReset: true });
    }
  }, [canonicalSearch, location.search, navigate]);

  const {
    page, status: statusFilter, orderType: orderTypeFilter, businessLine: businessLineFilter,
    fulfillment: fulfillmentFilter, location: locationFilter, search: appliedSearch,
    datePreset, startDate, endDate, orderId: selectedOrderId,
  } = queryState;
  const setPage = useCallback((nextPage: number) => changeQuery({ page: nextPage }), [changeQuery]);
  // Typing is local. Only Search applies a query; navigation restores its submitted value.
  const [searchDraft, setSearchDraft] = useState({ key: location.key, value: appliedSearch });
  if (searchDraft.key !== location.key) {
    setSearchDraft({ key: location.key, value: appliedSearch });
  }
  const searchQuery = searchDraft.key === location.key ? searchDraft.value : appliedSearch;
  const setSearchQuery = (value: string) => setSearchDraft({ key: location.key, value });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  // Selected order
  const detailSelection = useMemo(() => ({ orderId: selectedOrderId }), [selectedOrderId]);
  const detailSelectionRef = useRef(detailSelection);
  useLayoutEffect(() => { detailSelectionRef.current = detailSelection; }, [detailSelection]);
  const [detailResult, setDetailResult] = useState<{ selection: typeof detailSelection; order: Order } | null>(null);
  const selectedOrder = detailResult?.selection === detailSelection ? detailResult.order : null;
  // Mutation responses may finish after navigation, too. They must never reopen
  // a closed detail view or displace the order selected by the current URL.
  const setSelectedOrder = (order: Order) => {
    if (detailSelectionRef.current === detailSelection && queryStateRef.current.orderId === order.id) {
      setDetailResult({ selection: detailSelection, order });
    }
  };
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailReturnRef = useRef<{ orderId: number; x: number; y: number; trigger: HTMLElement } | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const refundOpenerRef = useRef<HTMLButtonElement | null>(null);
  const orderDetailHeadingRef = useRef<HTMLHeadingElement>(null);
  const wasRefundOpenRef = useRef(false);
  const previousOrderIdRef = useRef(selectedOrderId);
  const [detailError, setDetailError] = useState<{ selection: typeof detailSelection; attempt: number; message: string } | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const currentDetailError = detailError?.selection === detailSelection && detailError.attempt === detailAttempt ? detailError.message : null;
  const [saving, setSaving] = useState(false);

  // Ship modal
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipOrderId, setShipOrderId] = useState<number | null>(null);
  const [shipTrackingNumber, setShipTrackingNumber] = useState('');
  const [shipCarrier, setShipCarrier] = useState('');

  // Refund modal
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [pendingRefundRequest, setPendingRefundRequest] = useState<SavedRefundRequest | null>(null);
  useEffect(() => {
    setPendingRefundRequest(selectedOrder ? savedRefundRequest(selectedOrder.id) : null);
  }, [selectedOrder?.id, userId]);
  const [processingRefund, setProcessingRefund] = useState(false);
  useEffect(() => {
    const wasOpen = wasRefundOpenRef.current;
    wasRefundOpenRef.current = showRefundModal;
    if (!wasOpen || showRefundModal) return;
    const frame = requestAnimationFrame(() => {
      // A full refund removes its opener while the outer detail stays open.
      if (!refundOpenerRef.current?.isConnected || refundOpenerRef.current.disabled) {
        orderDetailHeadingRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showRefundModal]);

  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<OrdersSummaryResponse | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadedKeyRef = useRef('');
  const requestRef = useRef(0);
  const pendingKeyRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildFilterParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (statusFilter !== 'all') {
      if (mode === 'pickup_queue') params.queue_stage = statusFilter;
      else params.status = statusFilter;
    }
    if (orderTypeFilter !== 'all') params.order_type = orderTypeFilter;
    if (businessLineFilter !== 'all') params.business_line = businessLineFilter;
    if (fulfillmentFilter !== 'all') params.fulfillment_type = fulfillmentFilter;
    if (locationFilter !== 'all') params.location_id = Number(locationFilter);
    if (appliedSearch) params.search = appliedSearch;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return params;
  }, [mode, statusFilter, orderTypeFilter, businessLineFilter, fulfillmentFilter, locationFilter, appliedSearch, startDate, endDate]);
  const queryKey = JSON.stringify({ page, ...buildFilterParams() });
  const queryContext = orderListContext(queryState, mode);
  const hasCurrentData = loadedKey === queryKey;
  const stale = lastUpdated !== null && clock - lastUpdated > 30_000;

  // Keep list and counts as one successful snapshot. Older filter responses
  // cannot replace a newer request; refreshes preserve rendered rows and focus.
  const fetchOrders = useCallback(async (background = false) => {
    if (background && pendingKeyRef.current === queryKey) return;
    pendingKeyRef.current = queryKey;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    setLoading(loadedKeyRef.current !== queryKey);
    setRefreshing(true);
    try {
      const params = buildFilterParams();
      const [listing, counts] = await Promise.all([
        authGet<OrdersIndexResponse>('/admin/orders', getToken, { params: { page, per_page: 25, ...params }, signal: controller.signal, timeout: 20_000 }),
        authGet<OrdersSummaryResponse>('/admin/orders/summary', getToken, { params, signal: controller.signal, timeout: 20_000 }),
      ]);
      if (requestRef.current !== requestId || controller.signal.aborted || orderListContext(queryStateRef.current, mode) !== queryContext) return;
      const lastPage = Math.max(1, listing.data.pagination.total_pages);
      if (page > lastPage) { changeQuery({ page: lastPage }, true); return; }
      setOrders(listing.data.orders);
      setTotalPages(listing.data.pagination.total_pages);
      setTotalCount(listing.data.pagination.total_count);
      setSummary(counts.data);
      setLoadedKey(queryKey);
      loadedKeyRef.current = queryKey;
      setLastUpdated(Date.now());
      setLoadError(null);
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== requestId || orderListContext(queryStateRef.current, mode) !== queryContext) return;
      setLoadError(axios.isAxiosError(error) ? error.response?.data?.error || 'Could not refresh orders. Check the connection and try again.' : 'Could not refresh orders. Try again.');
    } finally {
      if (requestRef.current === requestId) {
        pendingKeyRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [buildFilterParams, getToken, page, queryKey, queryContext, changeQuery, mode]);

  useEffect(() => {
    void fetchOrders();
    return () => { requestRef.current += 1; abortRef.current?.abort(); };
  }, [fetchOrders, refreshVersion]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.hidden) return;
      setClock(Date.now());
      if (mode !== 'default') void fetchOrders(true);
    };
    const interval = window.setInterval(refreshVisible, 10_000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [fetchOrders, mode]);

  const reconcileOrders = () => { setClock(Date.now()); setRefreshVersion((version) => version + 1); };

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  // ── Fetch single order details ────────────────────────────────
  const fetchOrderDetails = (orderId: number, trigger: HTMLButtonElement) => {
    detailOpenerRef.current = trigger;
    detailReturnRef.current = { orderId, x: window.scrollX, y: window.scrollY, trigger };
    changeQuery({ orderId });
  };

  useEffect(() => {
    if (selectedOrderId === null) return;
    const controller = new AbortController();
    const loadDetails = async () => {
      try {
        const response = await authGet<AdminOrderResponse>(`/admin/orders/${selectedOrderId}`, getToken, { signal: controller.signal, timeout: 20_000 });
        if (controller.signal.aborted || detailSelectionRef.current !== detailSelection || queryStateRef.current.orderId !== selectedOrderId) return;
        if (response.data.order.id !== selectedOrderId) throw new Error('The requested order was not returned.');
        setDetailResult({ selection: detailSelection, order: response.data.order });
      } catch (error) {
        if (controller.signal.aborted || detailSelectionRef.current !== detailSelection || queryStateRef.current.orderId !== selectedOrderId) return;
        setDetailError({ selection: detailSelection, attempt: detailAttempt, message: axios.isAxiosError(error) ? error.response?.data?.error || 'Check the connection and try again.' : 'The requested order could not be loaded. Try again.' });
      }
    };
    void loadDetails();
    return () => controller.abort();
  }, [selectedOrderId, detailSelection, getToken, detailAttempt]);

  useEffect(() => {
    const previousOrderId = previousOrderIdRef.current;
    previousOrderIdRef.current = selectedOrderId;
    if (selectedOrderId !== null || previousOrderId === null) return;
    const position = detailReturnRef.current;
    detailReturnRef.current = null;
    // Also handles browser Back. Wait until the modal releases its body lock.
    const frame = requestAnimationFrame(() => {
      if (queryStateRef.current.orderId !== null) return;
      if (position?.orderId === previousOrderId) {
        if (position.trigger.isConnected) position.trigger.focus({ preventScroll: true });
        else headingRef.current?.focus({ preventScroll: true });
        window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
      } else headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedOrderId]);

  const closeOrderDetails = () => changeQuery({ orderId: null });

  // ── Update order (from detail modal edit form) ────────────────
  const updateOrder = async (updates: {
    status: string;
    tracking_number?: string | null;
    admin_notes?: string | null;
  }) => {
    if (!selectedOrder) return false;
    try {
      setSaving(true);
      const response = await authPatch<AdminOrderResponse>(`/admin/orders/${selectedOrder.id}`, { order: updates }, getToken);
      setSelectedOrder(response.data.order);
      reconcileOrders();
      toast.success(response.data.message || 'Order updated successfully!');
      return true;
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update order' : 'Failed to update order');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Quick status update ───────────────────────────────────────
  const quickUpdateStatus = async (orderId: number, newStatus: string) => {
    if (saving) return;
    if (newStatus === 'shipped' && access.can('orders.manage')) {
      setShipOrderId(orderId);
      setShipTrackingNumber('');
      setShipCarrier('');
      setShowShipModal(true);
      return;
    }

    try {
      setSaving(true);
      const response = await authPatch<AdminOrderResponse>(`/admin/orders/${orderId}`, { order: { status: newStatus } }, getToken);
      if (selectedOrder?.id === orderId) setSelectedOrder(response.data.order);
      reconcileOrders();
      toast.success(`Order marked as ${formatStatus(newStatus)}!`);
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update status' : 'Failed to update status');
    } finally {
      setSaving(false);
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

      if (selectedOrder?.id === shipOrderId) setSelectedOrder(response.data.order);
      reconcileOrders();
      setShowShipModal(false);
      setShipOrderId(null);
      toast.success('Order shipped! Customer will receive a notification email.');
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to ship order' : 'Failed to ship order');
    } finally {
      setSaving(false);
    }
  };

  // ── Process refund ────────────────────────────────────────────
  const processRefund = async (amountCents: number, reason: string, restockItems: boolean) => {
    if (!selectedOrder || !Number.isInteger(amountCents) || amountCents <= 0 || processingRefund) {
      toast.error('Enter a valid refund amount.');
      return;
    }
    let requestKey: string | undefined;
    try {
      setProcessingRefund(true);
      const pending = prepareRefundRequest(selectedOrder.id, userId, { amount_cents: amountCents, reason, restock_items: restockItems });
      requestKey = pending.key;
      setPendingRefundRequest(pending);
      const response = await authPost<RefundResponse>(`/admin/orders/${selectedOrder.id}/refund`, pending.payload, getToken,
        { headers: { 'Idempotency-Key': pending.key } });
      const data = response.data;
      if (data.operation_uuid) rememberRefundOperation(pending, data.operation_uuid);
      setPendingRefundRequest(savedRefundRequest(selectedOrder.id));
      setSelectedOrder(data.order);
      reconcileOrders();
      if (['succeeded', 'failed'].includes(data.status)) {
        clearRefundRequest(selectedOrder.id, pending.key);
        setPendingRefundRequest(savedRefundRequest(selectedOrder.id));
        setShowRefundModal(false);
        if (data.status === 'failed') toast.error('Refund failed. Its reservation has been released.');
        else if (data.inventory_restoration_required) toast(data.message || 'Refund confirmed. Inventory requires manual review.');
        else toast.success(data.message || 'Refund confirmed.');
      } else toast('Refund status is being checked. Its amount remains reserved. Check this saved refund before submitting another.');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.no_operation === true) {
        if (requestKey) clearRefundRequest(selectedOrder.id, requestKey);
        setPendingRefundRequest(savedRefundRequest(selectedOrder.id));
        if (error.response.data.order) {
          setSelectedOrder(error.response.data.order);
          reconcileOrders();
        }
        toast.error(error.response.data.error || 'Refund request was rejected before dispatch. Review and correct it.');
      } else {
        toast.error(axios.isAxiosError(error) ? error.response?.data?.error || 'Refund outcome is not confirmed. Check the saved refund before submitting another.' : error instanceof Error ? error.message : 'Check the saved refund.');
      }
    } finally { setProcessingRefund(false); }
  };

  const checkRefund = async (operationId: string) => {
    if (!selectedOrder || processingRefund) return;
    setProcessingRefund(true);
    try {
      const response = await authPost<RefundResponse>(`/admin/orders/${selectedOrder.id}/refund_operations/${operationId}/reconcile`, {}, getToken);
      setSelectedOrder(response.data.order);
      reconcileOrders();
      if (pendingRefundRequest?.operationId === operationId && ['succeeded', 'failed'].includes(response.data.status)) {
        clearRefundRequest(selectedOrder.id, pendingRefundRequest.key);
        setPendingRefundRequest(savedRefundRequest(selectedOrder.id));
      }
      toast(response.data.message || `Refund ${response.data.status}`);
    } catch (error) { toast.error(axios.isAxiosError(error) ? error.response?.data?.error || 'Refund remains unresolved.' : 'Refund remains unresolved.'); }
    finally { setProcessingRefund(false); }
  };

  // ── Resend notification ───────────────────────────────────────
  const resendNotification = async (orderId: number) => {
    try {
      await authPost(`/admin/orders/${orderId}/notify`, {}, getToken);
      toast.success('Notification email sent to customer!');
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to send notification' : 'Failed to send notification');
    }
  };

  const handleSearch = () => {
    // Invalidate the typing buffer on submit. A fast Back can skip React's
    // intermediate navigation render and return to the same history key.
    setSearchDraft({ key: '', value: searchQuery.trim() });
    if (searchQuery.trim() === appliedSearch && page === 1) reconcileOrders();
    else changeQuery({ search: searchQuery, page: 1 });
  };

  const updateDatePreset = (preset: string) => {
    const datePreset = preset as OrderDatePreset;
    changeQuery({ datePreset, page: 1, ...(datePreset === 'custom' ? {} : orderDateRange(datePreset)) });
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
    ? 'Acknowledge paid meals, pack, then mark Ready.'
    : mode === 'shipping_queue'
      ? 'Operational queue for shipping fulfillment and handoff workflows.'
      : `${totalCount} total orders`;
  const queueStatusOptions = mode === 'pickup_queue'
    ? [ 'new_paid', 'confirmed', 'ready', 'picked_up', 'waiting_payment', 'all_active' ]
    : mode === 'shipping_queue'
      ? [ 'pending', 'processing', 'shipped', 'delivered' ]
      : [];

  const stageLabel = (status: string) => ({ new_paid: 'New paid', waiting_payment: 'Waiting for payment', all_active: 'All active', confirmed: mode === 'pickup_queue' ? 'Acknowledged' : 'Confirmed' }[status] || formatStatus(status));

  return (
    <div className={mode === 'pickup_queue' ? 'space-y-4' : 'space-y-6'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'default' ? (
              <>
                <span className="font-semibold text-gray-700">{hasCurrentData ? totalCount : '—'}</span> total orders
              </>
            ) : (
              pageSubtitle
            )}
          </p>
        </div>
        {access.can('orders.export') && <button
          type="button"
          onClick={exportOrdersCsv}
          disabled={exporting}
          className="px-4 py-2.5 text-sm font-semibold border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={reconcileOrders} disabled={refreshing} className="min-h-11 px-4 border border-gray-300 rounded-lg bg-white disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh orders'}</button>
        <span role="status">{lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'No successful update yet'}{loadError ? ' · Updates unavailable' : stale ? ' · Updates delayed — this snapshot may be stale' : ''}</span>
      </div>
      {loadError && <div role="alert" className="border border-amber-300 bg-amber-50 text-amber-950 p-4 rounded-lg">
        <p>{loadError}</p><p>{hasCurrentData ? 'Showing the last saved snapshot for these filters. It may be out of date.' : 'Orders for these filters have not loaded.'}</p>
        <button type="button" onClick={reconcileOrders} disabled={refreshing} className="min-h-11 underline font-semibold">Try again</button>
      </div>}
      {selectedOrderId !== null && !selectedOrder && <div role={currentDetailError ? 'alert' : 'status'} className="border border-gray-300 bg-white p-4 rounded-lg">
        {currentDetailError ? <>
          <p>Could not load order #{selectedOrderId}. {currentDetailError}</p>
          <button type="button" onClick={() => setDetailAttempt((attempt) => attempt + 1)} className="min-h-11 underline font-semibold mr-4">Retry order details</button>
        </> : <p>Loading order #{selectedOrderId}…</p>}
        <button type="button" onClick={closeOrderDetails} className="min-h-11 underline font-semibold">Close order details</button>
      </div>}
      {mode === 'pickup_queue' && hasCurrentData && (summary?.queue_stage_counts?.new_paid || 0) > 0 && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-amber-950 font-semibold">{summary?.queue_stage_counts.new_paid} paid orders need acknowledgment</p>}
      {queueStatusOptions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
          {queueStatusOptions.map((status) => {
            const counts = mode === 'pickup_queue' ? summary?.queue_stage_counts : summary?.status_counts;
            const count = hasCurrentData ? counts?.[status] ?? '—' : '—';
            return (
              <button
                key={status}
                type="button"
                onClick={() => changeQuery({ status, page: 1 })}
                className={`px-3 py-2 rounded-lg text-sm border transition ${
                  statusFilter === status
                    ? 'bg-tsPrimary text-white border-tsPrimary'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {stageLabel(status)} ({count})
              </button>
            );
          })}
          <div className="ml-auto text-sm text-gray-600 flex items-center gap-4">
            <span>All stages: <span className="font-semibold text-gray-900">{hasCurrentData ? summary?.total_orders ?? '—' : '—'}</span></span>
            <span>Paid, all stages: <span className="font-semibold text-gray-900">{hasCurrentData ? summary?.paid_orders ?? '—' : '—'}</span></span>
          </div>
        </div>
      )}

      {/* Filters */}
      <OrderFilters
        pickupQueue={mode === 'pickup_queue'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={(status) => changeQuery({ status, page: 1 })}
        orderTypeFilter={orderTypeFilter}
        onOrderTypeFilterChange={(orderType) => changeQuery({ orderType, page: 1 })}
        businessLineFilter={businessLineFilter}
        onBusinessLineFilterChange={(businessLine) => changeQuery({ businessLine, page: 1 })}
        fulfillmentFilter={fulfillmentFilter}
        onFulfillmentFilterChange={(fulfillment) => changeQuery({ fulfillment, page: 1 })}
        locationFilter={locationFilter}
        onLocationFilterChange={(location) => changeQuery({ location, page: 1 })}
        locationOptions={locations.map((location) => ({ id: location.id, name: location.name }))}
        datePreset={datePreset}
        onDatePresetChange={updateDatePreset}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(startDate) => changeQuery({ startDate, datePreset: 'custom', page: 1 })}
        onEndDateChange={(endDate) => changeQuery({ endDate, datePreset: 'custom', page: 1 })}
      />

      {/* Orders List */}
      {loading || (!hasCurrentData && !loadError) ? (
        <SkeletonListPage />
      ) : !hasCurrentData && loadError ? null : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            No matching orders
          </h3>
          <p className="text-gray-500">
            {mode === 'default'
              ? 'Orders will appear here once customers start placing them.'
              : 'Try adjusting status, location, or business line filters.'}
          </p>
        </div>
      ) : mode === 'pickup_queue' ? (
        <PickupPackingList orders={orders} saving={saving} page={page} totalPages={totalPages} onPageChange={setPage} onQuickUpdateStatus={quickUpdateStatus} onViewDetails={fetchOrderDetails} />
      ) : mode === 'shipping_queue' ? (
        <ShippingPackingList orders={orders} saving={saving} page={page} totalPages={totalPages} onPageChange={setPage} onQuickUpdateStatus={quickUpdateStatus} onViewDetails={fetchOrderDetails} />
      ) : (
        <OrdersTable
          orders={orders}
          saving={saving}
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
          key={selectedOrder.id}
          order={selectedOrder}
          returnFocusRef={detailOpenerRef}
          focusHeadingRef={orderDetailHeadingRef}
          saving={saving}
          onClose={closeOrderDetails}
          onUpdateOrder={updateOrder}
          onQuickUpdateStatus={quickUpdateStatus}
          onResendNotification={resendNotification}
          onOpenRefundModal={(trigger) => { refundOpenerRef.current = trigger; setShowRefundModal(true); }}
          hasSavedRefund={pendingRefundRequest?.orderId === selectedOrder.id}
          checkingRefund={processingRefund}
          onCheckRefund={checkRefund}
          canManageOrder={access.can('orders.manage')}
          canChangeStatus={access.can('orders.status')}
          canRefund={access.can('payments.refund')}
          canNotify={access.can('orders.notify')}
          storeEmail={storeEmail}
        />
      )}

      {/* Ship Order Modal */}
        <ShipOrderModal
          open={showShipModal}
          saving={saving}
          carrier={shipCarrier}
          trackingNumber={shipTrackingNumber}
          onCarrierChange={setShipCarrier}
          onTrackingChange={setShipTrackingNumber}
          onShip={shipOrder}
          onClose={() => { setShowShipModal(false); setShipOrderId(null); }}
        />

      {/* Refund Modal */}
      {showRefundModal && selectedOrder && (
        <RefundModal
          returnFocusRef={refundOpenerRef}
          order={selectedOrder}
          processing={processingRefund}
          savedRequest={pendingRefundRequest}
          onProcess={processRefund}
          onClose={() => setShowRefundModal(false)}
        />
      )}
    </div>
  );
}
