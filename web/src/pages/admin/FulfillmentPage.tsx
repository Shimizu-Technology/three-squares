import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Maximize2, Minimize2, Volume2, VolumeX, RefreshCw, Clock,
  ChefHat, Package, CheckCircle2, Bell,
} from 'lucide-react';
import type { Order } from '../../components/admin/orders/orderUtils';
import { authGet, authPatch } from '../../services/authApi';
import { locationsApi } from '../../services/api';
import type { Location } from '../../services/api';
import { useBusinessLineStore } from '../../store/businessLineStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FulfillmentStatus = 'new' | 'preparing' | 'ready' | 'completed';

interface Column {
  key: FulfillmentStatus;
  label: string;
  statuses: string[];
  icon: React.ReactNode;
  color: string;         // tailwind bg
  headerColor: string;   // tailwind text/bg for header
  actionLabel?: string;
  actionColor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: Column[] = [
  {
    key: 'new',
    label: 'New Orders',
    statuses: ['pending', 'confirmed'],
    icon: <Bell className="w-5 h-5" />,
    color: 'bg-blue-50 border-blue-200',
    headerColor: 'bg-blue-600 text-white',
    actionLabel: 'Advance',
    actionColor: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white',
  },
  {
    key: 'preparing',
    label: 'In Progress',
    statuses: ['processing'],
    icon: <ChefHat className="w-5 h-5" />,
    color: 'bg-amber-50 border-amber-200',
    headerColor: 'bg-amber-500 text-white',
    actionLabel: 'Mark Ready',
    actionColor: 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white',
  },
  {
    key: 'ready',
    label: 'Ready',
    statuses: ['ready', 'shipped'],
    icon: <Package className="w-5 h-5" />,
    color: 'bg-emerald-50 border-emerald-200',
    headerColor: 'bg-emerald-600 text-white',
    actionLabel: 'Complete',
    actionColor: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white',
  },
  {
    key: 'completed',
    label: 'Completed',
    statuses: ['picked_up', 'delivered'],
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: 'bg-gray-50 border-gray-200',
    headerColor: 'bg-gray-500 text-white',
  },
];

const POLL_INTERVAL = 15_000;
const COMPLETED_MAX_AGE_MS = 30 * 60 * 1000; // 30 min
const TIME_WARNING_MS = 10 * 60 * 1000;
const TIME_DANGER_MS = 20 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeColor(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff >= TIME_DANGER_MS) return 'text-red-600 font-bold';
  if (diff >= TIME_WARNING_MS) return 'text-amber-600 font-semibold';
  return 'text-gray-500';
}

function fulfillmentBadge(type?: string): { label: string; className: string } {
  switch (type) {
    case 'pickup':
      return { label: 'Pickup', className: 'bg-blue-100 text-blue-800' };
    case 'shipping':
      return { label: 'Shipping', className: 'bg-purple-100 text-purple-800' };
    case 'dine_in':
      return { label: 'Dine-in', className: 'bg-teal-100 text-teal-800' };
    default:
      return { label: type || 'N/A', className: 'bg-gray-100 text-gray-700' };
  }
}

function columnForStatus(status: string): FulfillmentStatus {
  for (const col of COLUMNS) {
    if (col.statuses.includes(status)) return col.key;
  }
  return 'completed';
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

interface OrderCardProps {
  order: Order;
  column: Column;
  onAdvance: (orderId: number) => void;
  advancing: Set<number>;
}

function OrderCard({ order, column, onAdvance, advancing }: OrderCardProps) {
  const isAdvancing = advancing.has(order.id);
  const touchStartX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!column.actionLabel) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx > 0) setSwipeOffset(Math.min(dx, 120));
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 80 && column.actionLabel && !isAdvancing) {
      onAdvance(order.id);
    }
    setSwipeOffset(0);
  };

  const fb = fulfillmentBadge(order.fulfillment_type);

  return (
    <div
      ref={cardRef}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-3 touch-manipulation select-none transition-transform"
      style={{ transform: `translateX(${swipeOffset}px)`, opacity: swipeOffset > 80 ? 0.7 : 1 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header: order # + time */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-bold text-gray-900 tracking-tight">
          #{order.order_number.split('-').slice(-2).join('-')}
        </span>
        <span className={`text-sm ${timeColor(order.created_at)}`}>
          {timeAgo(order.created_at)}
        </span>
      </div>

      {/* Customer */}
      <p className="text-base font-medium text-gray-800 mb-1 truncate">
        {order.customer_name || 'Guest'}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${fb.className}`}>
          {fb.label}
        </span>
        {order.location_name && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
            {order.location_name}
          </span>
        )}
      </div>

      {/* Items */}
      <ul className="space-y-1 mb-3 max-h-40 overflow-y-auto">
        {order.order_items.map((item) => (
          <li key={item.id} className="text-sm text-gray-700 flex justify-between">
            <span className="font-medium">
              {item.quantity > 1 && <span className="text-gray-500 mr-1">{item.quantity}×</span>}
              {item.product_name}
              {item.variant_name && item.variant_name !== item.product_name && (
                <span className="text-gray-400 text-xs ml-1">({item.variant_name})</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Notes */}
      {order.notes && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-3 border border-amber-100">
          📝 {order.notes}
        </div>
      )}

      {/* Action button */}
      {column.actionLabel && (
        <button
          onClick={() => onAdvance(order.id)}
          disabled={isAdvancing}
          className={`w-full py-3 rounded-xl text-base font-bold transition-all min-h-[48px] ${column.actionColor} ${
            isAdvancing ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isAdvancing ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Updating…
            </span>
          ) : (
            column.actionLabel
          )}
        </button>
      )}

      {/* Swipe hint */}
      {swipeOffset > 20 && column.actionLabel && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-emerald-600 font-medium">
          → {column.actionLabel}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FulfillmentPage
// ---------------------------------------------------------------------------

export default function FulfillmentPage() {
  const { getToken } = useAuth();
  const selectedLine = useBusinessLineStore((s) => s.selected);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<Set<number>>(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevOrderIdsRef = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Load locations
  useEffect(() => {
    locationsApi.getLocations().then((res) => setLocations(res.locations)).catch(() => {});
  }, []);

  // Audio element
  useEffect(() => {
    // Create a simple beep using AudioContext when needed
    audioRef.current = null; // We'll use AudioContext instead
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio not available
    }
  }, [soundEnabled]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      // Fetch active orders (all non-cancelled statuses we care about)
      const statuses = ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'picked_up', 'delivered'];
      const params: Record<string, string> = { per_page: '200' };

      if (locationFilter !== 'all') {
        params.location_id = locationFilter;
      }

      // Build business line filter
      if (selectedLine !== 'all') {
        const lineMap: Record<string, string> = {
          three_squares: 'three_squares',
          latte_stone_cookies: 'latte_stone',
          bgpacific: 'catering',
        };
        if (lineMap[selectedLine]) {
          params.business_line = lineMap[selectedLine];
        }
      }

      const response = await authGet<{ orders: Order[] }>(
        '/api/v1/admin/orders',
        getToken,
        { params }
      );

      const allOrders = response.data.orders.filter((o) => statuses.includes(o.status));

      // Filter completed orders older than 30 min
      const now = Date.now();
      const filtered = allOrders.filter((o) => {
        if (['picked_up', 'delivered'].includes(o.status)) {
          const age = now - new Date(o.updated_at || o.created_at).getTime();
          return age < COMPLETED_MAX_AGE_MS;
        }
        return true;
      });

      // Check for new orders
      const newIds = new Set(filtered.filter((o) => o.status === 'confirmed').map((o) => o.id));
      const prevIds = prevOrderIdsRef.current;
      const hasNewOrders = [...newIds].some((id) => !prevIds.has(id));
      if (hasNewOrders && prevIds.size > 0) {
        playNotificationSound();
      }
      prevOrderIdsRef.current = newIds;

      setOrders(filtered);
    } catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 401) {
        console.error('Failed to fetch orders:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, locationFilter, selectedLine, playNotificationSound]);

  // Initial load + polling
  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders]);

  // Advance order status
  const handleAdvance = useCallback(async (orderId: number) => {
    if (advancing.has(orderId)) return;

    // Optimistic update
    setAdvancing((prev) => new Set(prev).add(orderId));
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      // Map depends on order type — backend handles the logic via advance_status,
      // this is just for optimistic UI updates
      const nextStatusMap: Record<string, string> = {
        pending: 'confirmed',
        confirmed: 'ready',       // pickup/wholesale: confirmed → ready
        processing: 'shipped',    // retail: processing → shipped
        ready: 'picked_up',       // pickup: ready → picked_up
        shipped: 'delivered',     // retail: shipped → delivered
      };
      const nextStatus = nextStatusMap[order.status];
      if (nextStatus) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        );
      }
    }

    try {
      const response = await authPatch<{ order: Order }>(
        `/api/v1/admin/orders/${orderId}/advance_status`,
        {},
        getToken
      );
      // Update with server response
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? response.data.order : o))
      );
      toast.success('Order updated');
    } catch (err) {
      // Revert optimistic update
      toast.error(
        axios.isAxiosError(err)
          ? err.response?.data?.error || 'Failed to advance order'
          : 'Failed to advance order'
      );
      fetchOrders(); // Re-fetch to get correct state
    } finally {
      setAdvancing((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [advancing, orders, getToken, fetchOrders]);

  // Group orders by column
  const grouped: Record<FulfillmentStatus, Order[]> = {
    new: [],
    preparing: [],
    ready: [],
    completed: [],
  };
  for (const order of orders) {
    const col = columnForStatus(order.status);
    grouped[col].push(order);
  }
  // Sort each column: oldest first (urgent on top)
  for (const key of Object.keys(grouped) as FulfillmentStatus[]) {
    grouped[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const totalActive = grouped.new.length + grouped.preparing.length + grouped.ready.length;

  // Fullscreen: hide admin sidebar via CSS class
  useEffect(() => {
    if (fullscreen) {
      document.body.classList.add('fulfillment-fullscreen');
    } else {
      document.body.classList.remove('fulfillment-fullscreen');
    }
    return () => document.body.classList.remove('fulfillment-fullscreen');
  }, [fullscreen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-lg">Loading fulfillment view…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fulfillment-page -m-4 lg:-m-8 min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">
            🍳 Fulfillment
          </h1>
          <span className="px-2.5 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
            {totalActive} active
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Location filter */}
          {locations.length > 1 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] bg-white"
            >
              <option value="all">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}

          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition ${
              soundEnabled
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
            }`}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchOrders}
            className="p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            title="Refresh now"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Clock */}
          <div className="flex items-center gap-1.5 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg min-h-[44px]">
            <Clock className="w-4 h-4" />
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Kanban columns */}
      <div className="grid grid-cols-4 gap-3 p-3 h-[calc(100vh-80px)] overflow-hidden">
        {COLUMNS.map((col) => {
          const colOrders = grouped[col.key];
          const isCompleted = col.key === 'completed';
          const visible = isCompleted && !showCompleted ? [] : colOrders;

          return (
            <div
              key={col.key}
              className={`flex flex-col rounded-xl border-2 ${col.color} overflow-hidden`}
            >
              {/* Column header */}
              <button
                onClick={isCompleted ? () => setShowCompleted(!showCompleted) : undefined}
                className={`flex items-center justify-between px-4 py-3 ${col.headerColor} ${
                  isCompleted ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className="flex items-center gap-2">
                  {col.icon}
                  <span className="font-bold text-sm uppercase tracking-wide">{col.label}</span>
                </div>
                <span className="bg-white/25 text-white font-bold text-sm px-2.5 py-0.5 rounded-full min-w-[28px] text-center">
                  {colOrders.length}
                </span>
              </button>

              {/* Cards */}
              <div
                className="flex-1 overflow-y-auto p-3 space-y-0"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {visible.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    {isCompleted && !showCompleted ? 'Tap header to show' : 'No orders'}
                  </div>
                ) : (
                  visible.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      column={col}
                      onAdvance={handleAdvance}
                      advancing={advancing}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
