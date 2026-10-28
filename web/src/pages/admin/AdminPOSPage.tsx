import { initialPOSLocation, posLocationPreferenceKey } from '../../components/pos/initialLocation';
import { useState, useEffect, useMemo, useCallback, useRef, useId, lazy, Suspense, type RefObject } from 'react';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Notice } from '../../components/ui/Notice';
import { POSProductTile } from '../../components/pos/POSProductTile';
import { CartLine } from '../../components/pos/CartLine';
import { CompletedSale, type CompletedSaleFacts } from '../../components/pos/CompletedSale';
import { ReaderPickerDialog } from '../../components/pos/ReaderPickerDialog';
import '../../components/pos/pos.css';
import AdminModal from '../../components/admin/AdminModal';
import { useAuth, SignInButton } from '@clerk/clerk-react';
import { StaffAccessProvider, StaffAccessDenied, useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import {
  ArrowLeft, Search, ShoppingCart, Banknote, MapPin, Check, ChefHat, AlertCircle,
  Wifi, WifiOff, Smartphone, RefreshCw
} from 'lucide-react';
import {
  initializeTerminal,
  discoverReaders,
  connectToReader,
  resumeStripePayment,
  cancelPaymentCollection,
  disconnectReader,
  onStatusChange,
  destroyTerminal,
  setTokenProvider,
  setTerminalLocation,
  type TerminalStatus,
  startTerminalPayment,
} from '../../services/terminal';
import { usePaymentTerminal } from '../../hooks/usePaymentTerminal';
import TerminalControls from '../../components/payment/TerminalControls';
import ManualCardDialog from '../../components/payment/ManualCardDialog';
import AdminRequestState from '../../components/admin/AdminRequestState';
import LocalAvailabilityToggle from '../../components/admin/LocalAvailabilityToggle';
import { reconcilePOSCart, remainingPOSCapacity, type POSProduct, type POSVariant, type POSCategory, type CartItem } from '../../components/admin/posCart';
import type { Reader } from '@stripe/terminal-js';

const locationLabel = (name: string) => name.replace(/^Three Squares\s*(?:@\s*)?/i, '').trim() || name;

const SimulatedTerminalPanel = import.meta.env.DEV ? lazy(() => import('../../components/payment/simulation/SimulatedTerminalPanel')) : null;

// ─── Types ──────────────────────────────────────────────────────────────────

interface POSLocation {
  id: number;
  slug: string;
  name: string;
  address: string;
}

type ReaderMeta = {
  id?: string;
  label?: string;
  serial_number?: string;
  device_type?: string;
};

function getReaderMeta(reader: Reader): ReaderMeta {
  return reader as Reader & ReaderMeta;
}

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const POS_PENDING_TERMINAL_KEY = 'tsq-pos-pending-terminal-payment';
interface SavedPOSPayment {
  user_id: string;
  order_data: Record<string, unknown>;
  order_id?: number;
  order_number?: string;
  simulated_attempt_id?: string | null;
  attempt_id?: string | null;
  terminal_id?: number | null;
  payment_state?: string;
  collection_mode?: string;
  checkout_session_id?: string;
}
function savedPOSPayment(): SavedPOSPayment | null {
  try { return JSON.parse(localStorage.getItem(POS_PENDING_TERMINAL_KEY) || 'null'); } catch { return null; }
}


async function fetchPOSMenu(token: string, locationId?: number, includeUnavailable = false): Promise<{ categories: POSCategory[]; locations: POSLocation[]; default_location_id?: number }> {
  const params = new URLSearchParams();
  if (locationId) params.set('location_id', locationId.toString());
  if (includeUnavailable) params.set('include_unavailable', 'true');
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/menu?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('Failed to load menu');
  return res.json();
}

const POS_REQUEST_KEY = 'tsq-pos-order-request';
let posRequest: { digest: string; key: string; owner: string } | null = (() => {
  try { return JSON.parse(localStorage.getItem(POS_REQUEST_KEY) || 'null'); } catch { return null; }
})();
function clearPOSRequest() { posRequest = null; localStorage.removeItem(POS_REQUEST_KEY); }

async function createPOSOrder(token: string, orderData: Record<string, unknown>, owner: string | null | undefined) {
  if (!owner) throw new Error('Sign in before processing a saved payment.');
  if (posRequest && posRequest.owner !== owner) throw new Error('Saved payment belongs to another staff session; administrator reconciliation required.');
  const digest = JSON.stringify(orderData);
  if (posRequest && posRequest.digest !== digest) throw new Error('Resolve the saved payment before starting another order.');
  if (!posRequest) posRequest = { digest, key: crypto.randomUUID(), owner };
  localStorage.setItem(POS_REQUEST_KEY, JSON.stringify(posRequest));
  // Freeze a recoverable request only after owner/payload validation succeeds.
  const prior = savedPOSPayment();
  localStorage.setItem(POS_PENDING_TERMINAL_KEY, JSON.stringify({
    ...(prior?.user_id === owner && JSON.stringify(prior.order_data) === digest ? prior : {}),
    user_id: owner, order_data: orderData, created_at: new Date().toISOString(),
  }));
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': posRequest?.key || crypto.randomUUID(),
    },
    body: JSON.stringify({ order: orderData }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.outcome === 'rejected' && data.no_attempt === true) {
      clearPOSRequest();
      localStorage.removeItem(POS_PENDING_TERMINAL_KEY);
    }
    throw new Error(data.error || 'Failed to create order');
  }
  localStorage.setItem(POS_PENDING_TERMINAL_KEY, JSON.stringify({
    user_id: owner, order_data: orderData, order_id: data.id, order_number: data.order_number,
    simulated_attempt_id: data.payment_environment === 'simulated' ? data.payment_attempt_id : null,
    attempt_id: data.payment_attempt_id, terminal_id: data.payment_terminal_id,
    collection_mode: data.collection_mode, payment_state: data.payment_state, checkout_session_id: data.checkout_session_id,
    created_at: new Date().toISOString(),
  }));
  return data;
}

async function confirmTerminalPayment(token: string, orderId: number, allowClosed = false, allowPending = false) {
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/orders/${orderId}/confirm_terminal_payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (res.ok && allowPending) return data;
  if (res.ok && allowClosed && ['failed', 'cancelled', 'compensated'].includes(data.payment_state)) return data;
  if (!res.ok || data.payment_status !== 'paid' || !data.inventory_committed) throw new Error(data.error || 'Payment status is being checked. Keep this saved order; do not collect another payment.');
  return data;
}

// ─── Cash Modal ─────────────────────────────────────────────────────────────

function CashModal({
  totalCents,
  submitting,
  returnFocusRef,
  onComplete,
  onClose,
}: {
  totalCents: number;
  submitting: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onComplete: (cashReceivedCents: number) => void;
  onClose: () => void;
}) {
  const cashId = useId();
  const cashRef = useRef<HTMLInputElement>(null);
  const totalDollars = totalCents / 100;
  const [cashInput, setCashInput] = useState(totalDollars.toFixed(2));
  const cashReceived = parseFloat(cashInput) || 0;
  const changeDue = cashReceived - totalDollars;

  const denominations = [5, 10, 20, 50, 100];

  return (
    <AdminModal open title="Cash Payment" subtitle={`$${totalDollars.toFixed(2)}`} maxWidth="max-w-md"
      onClose={onClose} dismissible={!submitting} initialFocusRef={cashRef} returnFocusRef={returnFocusRef}
      footer={(
          <Button size="lg" className="w-full" icon={<Banknote />} loading={submitting}
            onClick={() => onComplete(Math.round(cashReceived * 100))} disabled={submitting || cashReceived < totalDollars}>
            Complete Cash Payment
          </Button>
      )}
    >
      <div className="space-y-4">
          {/* Quick denomination buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Amount</label>
            <div className="grid grid-cols-3 gap-2">
              {denominations.map((amt) => (
                <Button variant="secondary" key={amt} disabled={submitting} aria-pressed={cashInput === amt.toFixed(2)}
                  onClick={() => setCashInput(amt.toFixed(2))}>${amt}</Button>
              ))}
              <Button variant="secondary" disabled={submitting} aria-pressed={cashInput === totalDollars.toFixed(2)}
                onClick={() => setCashInput(totalDollars.toFixed(2))}>Exact</Button>
            </div>
          </div>

          {/* Custom input */}
          <div>
            <label htmlFor={cashId} className="block text-sm font-medium text-gray-700 mb-1">Cash Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
              <input
                id={cashId}
                ref={cashRef}
                disabled={submitting}
                type="number"
                step="0.01"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-lg text-lg font-medium focus:outline-none focus:border-tsPrimary"
              />
            </div>
          </div>

          {/* Change due */}
          {changeDue > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
              <span className="font-medium text-green-800">Change Due</span>
              <span className="text-2xl font-bold text-green-700">${changeDue.toFixed(2)}</span>
            </div>
          )}

          {changeDue < 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              Insufficient — need ${Math.abs(changeDue).toFixed(2)} more
            </div>
          )}
      </div>
    </AdminModal>
  );
}

// ─── Variant Picker Modal ───────────────────────────────────────────────────

function VariantPickerModal({
  product,
  onSelect,
  onClose,
  returnFocusRef,
}: {
  product: POSProduct;
  returnFocusRef: RefObject<HTMLElement | null>;
  onSelect: (variant: POSVariant) => void;
  onClose: () => void;
}) {
  return (
    <AdminModal open title={product.name} subtitle="Choose an available option" maxWidth="max-w-sm" onClose={onClose} returnFocusRef={returnFocusRef}>
      <div className="space-y-2">
          {product.variants.map((v) => (
            <div key={v.id} className="space-y-1 rounded-lg border p-3">
              <p className="text-sm font-medium">{v.name}</p>
              <Button variant="secondary" className="w-full" aria-label={`Choose ${v.name}`} onClick={() => onSelect(v)} disabled={!v.in_stock}>
                Choose option · {v.price_formatted}
              </Button>
            </div>
          ))}
      </div>
    </AdminModal>
  );
}

// ─── Main POS Page ──────────────────────────────────────────────────────────

export default function AdminPOSPage() {
  return <StaffAccessProvider><POSAccessGate /></StaffAccessProvider>;
}

function POSAccessGate() {
  const access = useStaffAccess();
  if (access.loading) return <div role="status" className="p-6">Checking POS access…</div>;
  if (access.error) return <div role="alert" className="space-y-4 p-6"><p>POS access could not be checked.</p><Button onClick={() => void access.reload()}>Retry access check</Button></div>;
  if (!access.user) return <div className="space-y-4 p-6"><p>Sign in to use POS.</p><SignInButton mode="modal"><Button>Sign in</Button></SignInButton></div>;
  return access.can('pos.sell') ? <AdminPOSWorkspace /> : <StaffAccessDenied />;
}

function AdminPOSWorkspace() {
  const access = useStaffAccess();
  const { getToken, userId } = useAuth();

  // Data
  const [categories, setCategories] = useState<POSCategory[]>([]);
  const [locations, setLocations] = useState<POSLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadedLocation, setLoadedLocation] = useState<number | null>(null);
  const menuRequest = useRef(0);
  const menuActive = useRef(false);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuMode, setMenuMode] = useState<'sale' | 'availability'>('sale');
  const [availabilityError, setAvailabilityError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<number | undefined>(() => {
    try {
      const id = JSON.parse(localStorage.getItem(POS_PENDING_TERMINAL_KEY) || 'null')?.order_data?.location_id;
      return Number.isInteger(id) && id > 0 ? id : undefined;
    } catch { return undefined; }
  });

  const selectedLocationRef = useRef(selectedLocation);
  selectedLocationRef.current = selectedLocation;

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [orderType, setOrderType] = useState<'pickup' | 'dine_in'>('pickup');
  const [quickAdjustVariantId, setQuickAdjustVariantId] = useState<number | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<{ product: POSProduct; variant: POSVariant } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cartRef = useRef<HTMLDivElement | null>(null);

  // Modals
  const [variantPickerProduct, setVariantPickerProduct] = useState<POSProduct | null>(null);
  const [showCashModal, setShowCashModal] = useState(false);
  const cashButtonRef = useRef<HTMLButtonElement>(null);
  const readerButtonRef = useRef<HTMLButtonElement>(null);
  const wasCashOpenRef = useRef(false);
  const variantOpenerRef = useRef<HTMLElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<CompletedSaleFacts | null>(null);

  // Terminal
  const [terminalLocationReady, setTerminalLocationReady] = useState(false);
  const [resettingReader, setResettingReader] = useState(false);
  const [savedPayment, setSavedPayment] = useState(savedPOSPayment);
  const [manualSession, setManualSession] = useState<string | null>(null);
  const paymentTerminal = usePaymentTerminal({ locationId: selectedLocation, getToken });
  const { selected: selectedTerminal, selectedId: selectedTerminalId, select: selectTerminal, terminals: paymentTerminals, loading: readersLoading, reload: reloadPaymentTerminals } = paymentTerminal;
  const simulationActive = import.meta.env.DEV && selectedTerminal?.environment === 'simulated';
  const simulatedAttempt = savedPayment?.simulated_attempt_id ?? null;
  useEffect(() => {
    const saved = savedPOSPayment();
    if (saved && saved.user_id === userId && saved.terminal_id) {
      selectTerminal(saved.terminal_id);
    } else if (!saved && selectedTerminalId === null && !readersLoading) {
      const ready = paymentTerminals.find(row => row.collectable === true && row.enabled && row.status !== 'retired');
      if (ready) selectTerminal(ready.id);
    }
  }, [userId, selectedLocation, selectedTerminalId, selectTerminal, paymentTerminals, readersLoading, savedPayment]);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('not_initialized');
  const [terminalReader, setTerminalReader] = useState<Reader | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showReaderPicker, setShowReaderPicker] = useState(false);
  const [availableReaders, setAvailableReaders] = useState<Reader[]>([]);
  const [terminalCollecting, setTerminalCollecting] = useState(false);
  const [hasPendingTerminalSession, setHasPendingTerminalSession] = useState(() => Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));

  // ─── Load menu ──────────────────────────────────────────────────────────

  const hasMenu = selectedLocation !== undefined && loadedLocation === selectedLocation;
  const canSelectMenu = hasMenu && !loading && !loadError;
  const canManageAvailability = access.can('availability.manage');

  const loadMenu = useCallback(async () => {
    if (!menuActive.current) return;
    const generation = ++menuRequest.current;
    setLoading(true);
    setVariantPickerProduct(null);
    try {
      const token = await getToken();
      if (generation !== menuRequest.current || selectedLocationRef.current !== selectedLocation) return;
      if (!token) throw new Error('Sign in to load the POS menu');
      const data = await fetchPOSMenu(token, selectedLocation, canManageAvailability);
      if (generation !== menuRequest.current || selectedLocationRef.current !== selectedLocation) return;
      if (!Array.isArray(data.locations) || !Array.isArray(data.categories)) throw new Error('Invalid POS menu response');
      setLocations(data.locations);
      if (selectedLocation === undefined) {
        if (!data.locations.length) throw new Error('No POS locations available');
        // The unscoped response only discovers locations. Never offer its menu.
        let saved: string | null = null;
        try { saved = userId ? localStorage.getItem(posLocationPreferenceKey(userId)) : null; } catch { /* Storage may be unavailable. */ }
        setSelectedLocation(initialPOSLocation(data.locations, saved, data.default_location_id));
        return;
      }
      if (!data.locations.some(location => location.id === selectedLocation)) throw new Error('Selected POS location unavailable');
      try { if (userId) localStorage.setItem(posLocationPreferenceKey(userId), String(selectedLocation)); } catch { /* Storage may be unavailable. */ }
      setCategories(data.categories);
      setLoadedLocation(selectedLocation);
      setLoadError(false);
    } catch (err) {
      if (generation !== menuRequest.current || selectedLocationRef.current !== selectedLocation) return;
      console.error('Failed to load POS menu:', err);
      setLoadError(true);
    } finally {
      if (generation === menuRequest.current) setLoading(false);
    }
  }, [getToken, selectedLocation, canManageAvailability, userId]);

  useEffect(() => {
    menuActive.current = true;
    setLoadError(false);
    setVariantPickerProduct(null);
    void loadMenu();
    return () => { menuActive.current = false; menuRequest.current += 1; };
  }, [loadMenu]);

  useEffect(() => {
    let active = true;
    setTerminalLocationReady(false);
    setTerminalReader(null);
    setAvailableReaders([]);
    void setTerminalLocation(selectedLocation).then(() => {
      if (active) setTerminalLocationReady(!!selectedLocation);
    }).catch(error => { if (active) setTerminalError(error instanceof Error ? error.message : 'Reader credentials could not be reset.'); });
    return () => { active = false; };
  }, [selectedLocation]);

  // ─── Filtered items ─────────────────────────────────────────────────────

  const visibleCategories = useMemo(() => hasMenu ? categories : [], [hasMenu, categories]);
  const allItems = useMemo(() => visibleCategories.flatMap((c) => c.items), [visibleCategories]);
  const cartState = useMemo(() => reconcilePOSCart(cart, allItems), [cart, allItems]);
  const liveCart = cartState.items;

  const filteredItems = useMemo(() => {
    let items = activeCategory === 'All'
      ? allItems
      : visibleCategories.find((c) => c.name === activeCategory)?.items || [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }

    return items; // Offered sold-out items keep their place; the API excludes non-carried items.
  }, [allItems, visibleCategories, activeCategory, searchQuery]);

  const categoryNames = useMemo(() => ['All', ...visibleCategories.map((c) => c.name)], [visibleCategories]);
  const selectedLocationName = useMemo(
    () => { const location = locations.find(loc => loc.id === selectedLocation); return location ? locationLabel(location.name) : 'Select location'; },
    [locations, selectedLocation]
  );

  // ─── Cart logic ─────────────────────────────────────────────────────────

  const addToCart = useCallback((product: POSProduct, variant: POSVariant) => {
    if (!canSelectMenu) return;
    const currentProduct = allItems.find(item => item.id === product.id);
    const currentVariant = currentProduct?.variants.find(item => item.id === variant.id && item.in_stock);
    if (!currentProduct || !currentVariant || remainingPOSCapacity(currentVariant, liveCart) < 1) return;
    product = currentProduct;
    variant = currentVariant;
    setLastOrder(null);
    setCart((prev) => {
      if (remainingPOSCapacity(variant, reconcilePOSCart(prev, allItems).items) < 1) return prev;
      const existing = prev.find((c) => c.variant.id === variant.id);
      if (existing) {
        return prev.map((c) =>
          c.variant.id === variant.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, {
        cartId: `${variant.id}-${Date.now()}`,
        product,
        variant,
        quantity: 1,
      }];
    });
    setQuickAdjustVariantId(variant.id);
    setLastAddedItem({ product, variant });
  }, [canSelectMenu, allItems, liveCart]);

  const handleProductClick = useCallback((product: POSProduct, trigger: HTMLButtonElement) => {
    if (!canSelectMenu) return;
    const availableVariants = product.variants.filter(variant => remainingPOSCapacity(variant, liveCart) > 0);
    if (availableVariants.length === 0) return;
    if (availableVariants.length === 1) {
      addToCart(product, availableVariants[0]);
    } else {
      variantOpenerRef.current = trigger;
      setVariantPickerProduct({ ...product, variants: availableVariants });
    }
  }, [addToCart, canSelectMenu, liveCart]);

  const updateQuantity = useCallback((variantId: number, delta: number) => {
    const variant = allItems.flatMap(item => item.variants).find(item => item.id === variantId);
    if (delta > 0 && (!canSelectMenu || !variant || remainingPOSCapacity(variant, liveCart) < delta)) return;
    setCart(prev => {
      if (delta > 0 && variant && remainingPOSCapacity(variant, reconcilePOSCart(prev, allItems).items) < delta) return prev;
      return prev.map(line => line.variant.id === variantId ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0);
    });
  }, [canSelectMenu, allItems, liveCart]);

  const removeFromCart = useCallback((variantId: number) => {
    setCart((prev) => prev.filter((c) => c.variant.id !== variantId));
  }, []);

  const quickAdjustItem = useMemo(
    () => liveCart.find((item) => item.variant.id === quickAdjustVariantId) ?? null,
    [liveCart, quickAdjustVariantId]
  );

  const adjustQuickItem = useCallback((delta: number) => {
    if (!quickAdjustItem) return;
    updateQuantity(quickAdjustItem.variant.id, delta);
  }, [quickAdjustItem, updateQuantity]);

  const removeQuickItem = useCallback(() => {
    if (!quickAdjustItem) return;
    removeFromCart(quickAdjustItem.variant.id);
  }, [quickAdjustItem, removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName('Walk-in');
    setQuickAdjustVariantId(null);
  }, []);

  const cartTotal = useMemo(
    () => liveCart.reduce((sum, c) => sum + c.variant.price_cents * c.quantity, 0),
    [liveCart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity, 0),
    [cart]
  );
  const connectedReaderName = terminalReader
    ? (getReaderMeta(terminalReader).label || getReaderMeta(terminalReader).serial_number || 'Unknown Reader')
    : null;
  const canSubmitPayment = canSelectMenu && cartState.issues.length === 0 && cart.length > 0 && !submitting && !terminalCollecting && !hasPendingTerminalSession;

  const focusSearchField = useCallback(() => {
    const target = searchRef.current;
    if (!target) return;
    target.focus();
    target.select();
  }, []);

  useEffect(() => {
    const wasOpen = wasCashOpenRef.current;
    wasCashOpenRef.current = showCashModal;
    if (!wasOpen || showCashModal) return;
    // Successful cash disables its opener. Return focus to the recorded
    // completion so change remains visible on the stacked phone layout.
    const frame = requestAnimationFrame(() => {
      if (cashButtonRef.current?.disabled) {
        const completed = cartRef.current?.querySelector<HTMLElement>('[aria-label="Completed sale"]');
        if (completed) { completed.focus(); completed.scrollIntoView({ block: 'nearest' }); }
        else focusSearchField();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showCashModal, focusSearchField]);

  // ─── Terminal ────────────────────────────────────────────────────────────

  useEffect(() => {
    onStatusChange(setTerminalStatus);
    setTokenProvider(getToken);
    setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));

    return () => {
      destroyTerminal();
    };
  }, [getToken]);

  useEffect(() => {
    if (!terminalCollecting) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [terminalCollecting]);

  const handleConnectReader = useCallback(async (reader: Reader) => {
    if (!terminalLocationReady || terminalStatus === 'connecting' || terminalStatus === 'discovering') return;
    if (getReaderMeta(reader).id !== selectedTerminal?.terminal_id) { setTerminalError('Choose the registered reader for this POS location.'); return; }
    try {
      setTerminalError(null);
      const connected = await connectToReader(reader);
      setTerminalReader(connected);
      setShowReaderPicker(false);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [terminalStatus, terminalLocationReady, selectedTerminal?.terminal_id]);

  const handleDiscoverReaders = useCallback(async () => {
    if (!access.can('payments.terminals.discover') || selectedTerminal?.provider !== 'stripe' || !terminalLocationReady || terminalStatus === 'connecting' || terminalStatus === 'discovering') return;
    try {
      setTerminalError(null);
      await initializeTerminal();
      const readers = (await discoverReaders()).filter(reader => getReaderMeta(reader).id === selectedTerminal?.terminal_id);
      setAvailableReaders(readers);
      if (readers.length === 0) {
        setTerminalError('No readers found. Make sure the S700 is on and connected to WiFi.');
      } else if (readers.length === 1) {
        await handleConnectReader(readers[0]);
      } else {
        setShowReaderPicker(true);
      }
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Discovery failed');
    }
  }, [access, selectedTerminal?.provider, selectedTerminal?.terminal_id, handleConnectReader, terminalStatus, terminalLocationReady]);

  const handleReaderButtonClick = useCallback(async () => {
    if (selectedTerminal?.provider !== 'stripe' || selectedTerminal.environment === 'simulated' || !access.can('payments.terminals.discover') || !terminalLocationReady || terminalStatus === 'connecting' || terminalStatus === 'discovering') return;

    if (!terminalReader) {
      await handleDiscoverReaders();
      return;
    }

    try {
      setTerminalError(null);
      await initializeTerminal();
      const readers = (await discoverReaders()).filter(reader => getReaderMeta(reader).id === selectedTerminal?.terminal_id);
      setAvailableReaders(readers);
      setShowReaderPicker(true);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Reader refresh failed');
    }
  }, [access, selectedTerminal, terminalReader, terminalStatus, handleDiscoverReaders, terminalLocationReady]);

  const handleDisconnectReader = useCallback(async () => {
    try {
      await disconnectReader();
      setTerminalReader(null);
      setTerminalError(null);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  }, []);

  const handleCancelActiveTerminalPrompt = useCallback(async () => {
    try {
      await cancelPaymentCollection();
      setTerminalCollecting(false);
      setTerminalError(null);
      setTerminalError('Reader prompt cancelled. Check the saved payment before starting another.');
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Unable to cancel reader prompt');
    }
  }, []);

  const clearPendingTerminalSession = useCallback(() => {
    localStorage.removeItem(POS_PENDING_TERMINAL_KEY);
    clearPOSRequest();
    setHasPendingTerminalSession(false);
    setSavedPayment(null);
    setManualSession(null);
  }, []);

  const handleCheckSavedPayment = useCallback(async () => {
    try {
      const pending = JSON.parse(localStorage.getItem(POS_PENDING_TERMINAL_KEY) || 'null');
      if (!pending) return;
      if (pending.user_id !== userId) throw new Error('Saved payment belongs to another staff session; administrator reconciliation required.');
      const token = await getToken();
      if (!token) return;
      // Replaying creation uses the saved payload and original request key.
      const order = pending.order_data ? await createPOSOrder(token, pending.order_data, userId) : pending;
      setSavedPayment(savedPOSPayment());
      if (order.location_id) setSelectedLocation(order.location_id);
      if (order.payment_terminal_id) selectTerminal(order.payment_terminal_id);
      if (order.collection_mode === 'hosted' && order.checkout_session_id) setManualSession(order.checkout_session_id);
      const confirmed = order.payment_method === 'cash' && order.payment_status === 'paid' && order.inventory_committed
        ? order : await confirmTerminalPayment(token, order.id || order.order_id, true);
      if (['failed', 'cancelled', 'compensated'].includes(confirmed.payment_state)) {
        clearPendingTerminalSession();
        setTerminalError('Saved payment is closed. Review the cart before taking payment.');
        return;
      }
      setTerminalError(null);
      setLastOrder(confirmed);
      clearCart();
      clearPendingTerminalSession();
    } catch (error) {
      setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
      setTerminalError(error instanceof Error ? error.message : 'Payment remains unresolved.');
    } finally { setSavedPayment(savedPOSPayment()); await reloadPaymentTerminals(); }
  }, [getToken, userId, clearCart, clearPendingTerminalSession, selectTerminal, reloadPaymentTerminals]);

  const handleCancelSavedPayment = useCallback(async () => {
    try {
      const pending = JSON.parse(localStorage.getItem(POS_PENDING_TERMINAL_KEY) || 'null');
      const token = await getToken();
      if (!pending || !token) return;
      if (pending.user_id !== userId) throw new Error('Saved payment belongs to another staff session; administrator reconciliation required.');
      const order = pending.order_data ? await createPOSOrder(token, pending.order_data, userId) : pending;
      if (order.payment_method === 'cash' && order.payment_status === 'paid' && order.inventory_committed) {
        setLastOrder(order); clearCart(); clearPendingTerminalSession(); return;
      }
      if (!order.checkout_session_id) throw new Error('Saved payment needs administrator reconciliation.');
      const response = await fetch(`${API_BASE}/api/v1/checkout_sessions/${order.checkout_session_id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const state = await response.json();
      if (!response.ok) throw new Error(state.error || 'Cancellation is unresolved.');
      if (state.order?.payment_status === 'paid' && state.order.inventory_committed) {
        clearCart();
        clearPendingTerminalSession();
      } else if (['failed', 'cancelled', 'compensated'].includes(state.payment_state)) {
        clearPendingTerminalSession();
        setTerminalError('Saved payment is closed. Review the cart before taking payment.');
      } else throw new Error('Payment remains unresolved. Do not take another payment.');
    } catch (error) {
      setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
      setTerminalError(error instanceof Error ? error.message : 'Cancellation is unresolved.');
    } finally { setSavedPayment(savedPOSPayment()); await reloadPaymentTerminals(); }
  }, [getToken, userId, clearCart, clearPendingTerminalSession, reloadPaymentTerminals]);

  const handleResetReaderSession = useCallback(async () => {
    if (resettingReader) return;
    const locationId = selectedLocation;
    setResettingReader(true);
    try {
      setTerminalError(null);
      setTerminalLocationReady(false);
      await setTerminalLocation(locationId, { reset: true });
      if (selectedLocationRef.current !== locationId) return;
      setTerminalLocationReady(!!locationId);
      setTerminalReader(null);
      setAvailableReaders([]);
      setShowReaderPicker(false);
      setTerminalError(localStorage.getItem(POS_PENDING_TERMINAL_KEY) ? 'Reader reset. The saved payment still requires a status check.' : 'Reader reset. Connect a reader before taking card payments.');
      setTerminalCollecting(false);
    } catch (err) {
      if (selectedLocationRef.current === locationId) setTerminalError(err instanceof Error ? err.message : 'Failed to reset reader session');
    } finally { setResettingReader(false); }
  }, [selectedLocation, resettingReader]);

  const handleTerminalPayment = useCallback(async () => {
    if (!canSubmitPayment || !selectedTerminal?.collectable || !terminalLocationReady || localStorage.getItem(POS_PENDING_TERMINAL_KEY)) return;
    setTerminalCollecting(true);
    setTerminalError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in before taking payment.');
      const orderData = {
        customer_name: customerName || 'Walk-in', order_type: orderType,
        payment_method: 'card_present', location_id: selectedLocation,
        payment_terminal_id: selectedTerminal.id,
        items: cart.map(c => ({ product_variant_id: c.variant.id, quantity: c.quantity })),
      };
      const order = await createPOSOrder(token, orderData, userId);
      setSavedPayment(savedPOSPayment());
      setHasPendingTerminalSession(true);
      if (!posRequest?.key || !order.payment_terminal_id) throw new Error('Saved reader payment needs reconciliation.');
      // Reserve the original lane and persist a single dispatch claim. Retrying
      // this endpoint can only resume/query that same payment, never create one.
      const started = await startTerminalPayment({ token, orderId: order.id, terminalId: order.payment_terminal_id, key: posRequest.key });
      await paymentTerminal.reload();
      if (order.payment_environment === 'simulated' || order.payment_provider === 'worldpay') return;
      if (!terminalReader || getReaderMeta(terminalReader).id !== selectedTerminal.terminal_id) throw new Error('Reconnect the original registered reader before collecting.');
      if (!order.client_secret) throw new Error('Card collection is unavailable. Check the saved payment.');
      await resumeStripePayment(order.client_secret, started.terminal_resume?.provider_state || '', selectedTerminal.terminal_id);
      const confirmed = await confirmTerminalPayment(token, order.id);
      setTerminalError(null);
      setLastOrder(confirmed);
      clearCart();
      clearPendingTerminalSession();
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : 'Payment outcome unknown. Check the saved payment before collecting again.');
    } finally {
      setSavedPayment(savedPOSPayment());
      setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
      setTerminalCollecting(false);
    }
  }, [canSubmitPayment, selectedTerminal, terminalReader, terminalLocationReady, getToken, customerName, orderType, selectedLocation, cart, userId, paymentTerminal, clearCart, clearPendingTerminalSession]);

  const handleResumeReaderPayment = useCallback(async () => {
    setTerminalCollecting(true);
    try {
      const saved = savedPOSPayment();
      if (!saved || saved.user_id !== userId || !posRequest?.key || posRequest.owner !== userId) throw new Error('Use the original staff session to recover this payment.');
      const token = await getToken();
      if (!token) throw new Error('Sign in to recover payment.');
      const order = await createPOSOrder(token, saved.order_data, userId);
      setSavedPayment(savedPOSPayment());
      if (!order.payment_terminal_id) throw new Error('Saved payment has no reader. Check its status.');
      const checked = await confirmTerminalPayment(token, order.id, true, true);
      if (checked.payment_status === 'paid' && checked.inventory_committed) {
        setLastOrder(checked); clearCart(); clearPendingTerminalSession(); return;
      }
      if (['failed', 'cancelled', 'compensated'].includes(checked.payment_state)) {
        clearPendingTerminalSession(); setTerminalError('Saved payment is closed. Review the cart.'); return;
      }
      const started = await startTerminalPayment({ token, orderId: order.id, terminalId: order.payment_terminal_id, key: posRequest.key });
      if (order.payment_provider === 'stripe' && order.payment_environment !== 'simulated') {
        const originalReader = paymentTerminals.find(row => row.id === order.payment_terminal_id);
        const resume = started.terminal_resume;
        if (!originalReader || !resume?.client_secret || !resume.provider_state) throw new Error('Original reader payment is not ready to resume. Check its status.');
        await resumeStripePayment(resume.client_secret, resume.provider_state, originalReader.terminal_id);
        const confirmed = await confirmTerminalPayment(token, order.id);
        setLastOrder(confirmed); clearCart(); clearPendingTerminalSession(); setTerminalError(null);
      } else setTerminalError('Original reader dispatch/status requested. Check this saved payment before taking another payment.');
      await reloadPaymentTerminals();
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : 'Reader payment remains unresolved.');
    } finally { setTerminalCollecting(false); }
  }, [getToken, userId, paymentTerminals, reloadPaymentTerminals, clearCart, clearPendingTerminalSession]);

  const handleManualCardAction = useCallback(async () => {
    if (!canSubmitPayment || localStorage.getItem(POS_PENDING_TERMINAL_KEY)) return;
    setTerminalCollecting(true); setTerminalError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in before taking payment.');
      const order = await createPOSOrder(token, {
        customer_name: customerName || 'Walk-in', order_type: orderType,
        payment_method: 'card_online', location_id: selectedLocation,
        items: cart.map(c => ({ product_variant_id: c.variant.id, quantity: c.quantity })),
      }, userId);
      setSavedPayment(savedPOSPayment());
      if (!order.checkout_session_id) throw new Error('Check the saved payment before collecting.');
      setManualSession(order.checkout_session_id);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : 'Hosted payment unavailable. Check the saved order.');
    } finally {
      setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
      setTerminalCollecting(false);
    }
  }, [canSubmitPayment, getToken, customerName, orderType, selectedLocation, cart, userId]);

  // ─── Submit order ───────────────────────────────────────────────────────

  const submitOrder = useCallback(
    async (paymentMethod: 'cash' | 'stripe', cashReceivedCents?: number) => {
      if (cart.length === 0 || hasPendingTerminalSession || localStorage.getItem(POS_PENDING_TERMINAL_KEY)) return;
      if (!canSelectMenu || cartState.issues.length) {
        alert('Review the current location menu and resolve unavailable items before taking cash.');
        setShowCashModal(false);
        return;
      }
      setSubmitting(true);
      try {
        const token = await getToken();
        if (!token) return;

        const orderData: Record<string, unknown> = {
          customer_name: customerName || 'Walk-in',
          order_type: orderType,
          payment_method: paymentMethod,
          location_id: selectedLocation,
          items: cart.map((c) => ({
            product_variant_id: c.variant.id,
            quantity: c.quantity,
          })),
        };

        if (paymentMethod === 'cash' && cashReceivedCents) {
          orderData.cash_received_cents = cashReceivedCents;
        }

        const result = await createPOSOrder(token, orderData, userId);
        setLastOrder(result);
        clearPendingTerminalSession();
        setShowCashModal(false);
        clearCart();

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Order failed';
        alert(message);
      } finally {
        setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
        setShowCashModal(false);
        setSubmitting(false);
      }
    },
    [cart, customerName, orderType, selectedLocation, getToken, userId, clearCart, hasPendingTerminalSession, clearPendingTerminalSession, canSelectMenu, cartState.issues]
  );

  const handleCardAction = useCallback(() => {
    if (!canSubmitPayment || !terminalLocationReady) return;
    if (!selectedTerminal || (selectedTerminal.provider === 'stripe' && !simulationActive && !terminalReader)) {
      setTerminalError('Reader unavailable. Choose a reader or retry. Resolve any saved card payment before taking cash.');
      void handleDiscoverReaders();
      return;
    }
    void handleTerminalPayment();
  }, [canSubmitPayment, selectedTerminal, terminalReader, handleTerminalPayment, handleDiscoverReaders, terminalLocationReady, simulationActive]);

  useEffect(() => {
    if (cart.length === 0) {
      if (quickAdjustVariantId !== null) setQuickAdjustVariantId(null);
      return;
    }

    const selectedStillExists = quickAdjustVariantId !== null && cart.some((item) => item.variant.id === quickAdjustVariantId);
    if (!selectedStillExists) {
      setQuickAdjustVariantId(cart[0].variant.id);
    }
  }, [cart, quickAdjustVariantId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Native modal inertness does not stop window-level POS shortcuts.
      if (document.querySelector('dialog[open]') || showReaderPicker) return;
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      if ((event.key === '/' || (event.metaKey && event.key.toLowerCase() === 'k')) && !isTypingTarget) {
        event.preventDefault();
        focusSearchField();
        return;
      }

      if (event.key === 'Escape' && searchQuery) {
        event.preventDefault();
        setSearchQuery('');
        return;
      }

      if (isTypingTarget) return;

      if (event.key === 'F2') {
        event.preventDefault();
        setOrderType((prev) => prev === 'pickup' ? 'dine_in' : 'pickup');
        return;
      }

      if (event.key === 'F8' && canSubmitPayment) {
        event.preventDefault();
        setShowCashModal(true);
        return;
      }

      if (event.key === 'F9' && canSubmitPayment) {
        event.preventDefault();
        handleCardAction();
        return;
      }

      if (cart.length === 0) return;

      if (event.key === '[') {
        event.preventDefault();
        adjustQuickItem(-1);
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        adjustQuickItem(1);
        return;
      }

      if (event.key === '\\') {
        event.preventDefault();
        adjustQuickItem(5);
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && quickAdjustItem) {
        event.preventDefault();
        removeQuickItem();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const currentIndex = cart.findIndex((item) => item.variant.id === quickAdjustVariantId);
        if (currentIndex === -1) {
          setQuickAdjustVariantId(cart[0].variant.id);
          return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + direction + cart.length) % cart.length;
        setQuickAdjustVariantId(cart[nextIndex].variant.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showReaderPicker,
    canSubmitPayment,
    focusSearchField,
    handleCardAction,
    searchQuery,
    cart,
    quickAdjustVariantId,
    quickAdjustItem,
    adjustQuickItem,
    removeQuickItem,
  ]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 md:h-dvh flex flex-col md:flex-row bg-slate-50 md:overflow-hidden">
      <div ref={menuRef} tabIndex={-1} aria-label="POS menu" className="flex h-[75dvh] shrink-0 flex-col min-h-0 min-w-0 md:h-auto md:flex-1">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton to="/admin" aria-label="Exit POS to staff workspace"><ArrowLeft /></IconButton>
            <ChefHat aria-hidden="true" className="hidden h-5 w-5 shrink-0 text-tsNavy sm:block" />
            <div className="min-w-0"><h1 className="text-lg leading-6 font-semibold">POS</h1><p className="text-xs text-slate-600">{access.roleLabel} · {access.scopeLabel} · {selectedLocationName}</p></div>
          </div>
          {access.can('payments.terminals.discover') && selectedTerminal?.provider === 'stripe' && !simulationActive &&
            <IconButton ref={readerButtonRef} variant="secondary" aria-label={terminalReader ? 'Choose connected reader' : 'Connect reader'}
              title={terminalReader ? `Connected: ${connectedReaderName}` : 'Click to connect reader'} onClick={handleReaderButtonClick}
              loading={terminalStatus === 'connecting' || terminalStatus === 'discovering'}>{terminalReader ? <Wifi /> : <WifiOff />}</IconButton>}
        </header>
        <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white p-3">
          <div aria-label="Menu toolbar" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_44px]">
            <label className="block min-w-0 text-xs font-semibold text-slate-700">Sale location
              <span className="relative mt-1 block h-11 min-w-0">
                <MapPin aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2" />
                <select aria-label="Sale location" title={locations.find(location => location.id === selectedLocation)?.name}
                  disabled={access.user?.operational_scope === 'specific' || hasPendingTerminalSession || submitting || terminalCollecting || resettingReader || ['connecting', 'discovering', 'initializing'].includes(terminalStatus)}
                  value={selectedLocation || ''} onChange={event => setSelectedLocation(Number(event.target.value))} className="h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 text-base text-slate-900">
                  {locations.map(location => <option key={location.id} value={location.id}>{locationLabel(location.name)}</option>)}
                </select>
              </span>
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-700">Find a menu item
              <span className="relative mt-1 block"><Search aria-hidden="true" className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input ref={searchRef} type="search" placeholder="Search menu" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-base focus:outline-none focus:ring-2 focus:ring-tsPrimary" />
              </span>
            </label>
            <label className="col-span-2 row-start-2 block min-w-0 text-xs font-semibold text-slate-700 lg:col-auto lg:row-auto">Category
              <select aria-label="Category" value={activeCategory} onChange={event => setActiveCategory(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-base">
                {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <IconButton variant="secondary" aria-label="Refresh menu" loading={loading} disabled={!hasMenu || submitting || terminalCollecting} onClick={() => void loadMenu()}><RefreshCw /></IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>{cartCount} items</StatusBadge><StatusBadge tone="info">{orderType === 'dine_in' ? 'Dine in' : 'Pickup'}</StatusBadge>
            {canManageAvailability && <Button variant="ghost" aria-pressed={menuMode === 'availability'} onClick={() => {setMenuMode(mode => mode === 'sale' ? 'availability' : 'sale');setAvailabilityError('');}}>{menuMode === 'sale' ? 'Manage availability' : 'Back to sale'}</Button>}
          </div>
          <AdminRequestState resource="POS menu and locations" loading={loading} error={loadError} hasData={hasMenu} onRetry={() => void loadMenu()} />
          {availabilityError && <p role="alert" className="text-sm text-red-800">{availabilityError}</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {menuMode === 'availability' && <p className="mb-3 text-sm text-slate-700">Manage local sold-out status. Until location offerings are separated, unavailable entries appear here so they can be restored.</p>}
          {!hasMenu || (filteredItems.length === 0 && (loading || loadError)) ? null : filteredItems.length === 0 ?
            <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"><AlertCircle className="mb-2 h-6 w-6" /><p>No items found</p></div> :
            <div aria-label={menuMode === 'sale' ? 'Sale items' : 'Availability items'} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] gap-3">
              {filteredItems.map(item => {
                const hasStock = item.variants.some(variant => variant.in_stock);
                const canAdd = item.variants.some(variant => remainingPOSCapacity(variant, liveCart) > 0);
                const price = item.variants[0]?.price_formatted || 'Unavailable';
                const inCartQuantity = cart.filter(line => line.product.id === item.id).reduce((sum,line) => sum+line.quantity,0);
                return menuMode === 'sale' ? <POSProductTile key={item.id} name={item.name} price={price} inCartQuantity={inCartQuantity}
                  soldOut={!hasStock} atCapacity={hasStock && !canAdd} disabled={!canSelectMenu} onClick={event => handleProductClick(item,event.currentTarget)} /> :
                  <article key={item.id} aria-label={item.name} className="pos-availability-card">
                    <h2 className="pos-product-tile__title text-sm leading-5">{item.name}</h2><p className="pos-product-tile__price text-sm leading-5">{price}</p>
                    {selectedLocation && <LocalAvailabilityToggle compact key={`${item.id}:${selectedLocation}`} productId={item.id} productName={item.name}
                      locationId={selectedLocation} locationName={selectedLocationName} available={item.location_available !== false}
                      disabled={!canSelectMenu || submitting || terminalCollecting || hasPendingTerminalSession} onError={setAvailabilityError}
                      onSaved={(_productId,locationId) => {setAvailabilityError('');if (locationId === selectedLocationRef.current) void loadMenu();}} />}
                  </article>;
              })}
            </div>}
        </div>
      </div>
      <div ref={cartRef} tabIndex={-1} aria-label="Current sale" className="min-h-0 w-full md:w-80 xl:w-104 md:overflow-y-auto bg-white border-l border-slate-200 flex flex-col shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 md:hidden"><h2 className="text-lg font-semibold">Current sale</h2><Button variant="secondary" onClick={() => {menuRef.current?.scrollIntoView();searchRef.current?.focus({preventScroll:true});}}>Back to menu</Button></div>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <label className="block text-sm font-medium">Customer name<input type="text" value={customerName} onChange={event => setCustomerName(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base" /></label>
          <div role="group" aria-label="Order type" className="grid grid-cols-2 gap-2">{(['pickup','dine_in'] as const).map(type => <Button key={type} variant="secondary" aria-pressed={orderType === type} icon={orderType === type ? <Check /> : undefined} className="w-full" onClick={() => setOrderType(type)}>{type === 'dine_in' ? 'Dine In' : 'Pickup'}</Button>)}</div>
        </div>
        <div className="shrink-0 flex-1 p-4">
          {cart.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600"><ShoppingCart className="mb-3 h-10 w-10" /><p>Cart is empty</p><p className="text-xs">Tap items to add</p></div> :
            <div className="space-y-3">{liveCart.map(item => <CartLine key={item.variant.id} item={item} selected={quickAdjustVariantId === item.variant.id}
              increaseDisabled={!canSelectMenu || cartState.issues.some(issue => issue.variantId === item.variant.id)}
              max={Number.isFinite(remainingPOSCapacity(item.variant,liveCart)) ? item.quantity+remainingPOSCapacity(item.variant,liveCart) : undefined}
              onSelect={() => setQuickAdjustVariantId(item.variant.id)} onChange={next => updateQuantity(item.variant.id,next-item.quantity)} onRemove={() => removeFromCart(item.variant.id)} />)}</div>}
        </div>
        <div className="space-y-3 border-t border-slate-200 bg-white p-4">
          {cart.length > 0 && (!canSelectMenu || cartState.issues.length > 0) && <Notice tone="attention" role="alert">{!canSelectMenu ? <p>Load the current location menu before taking payment. Your cart is still here.</p> : cartState.issues.map(issue => <p key={issue.variantId}>{issue.message}</p>)}</Notice>}
          <div className="flex items-center justify-between gap-2"><div><p className="text-sm">Total · {cartCount} items</p><p className="text-xs">Prices for {selectedLocationName}</p></div><span className="text-2xl font-semibold tabular-nums">${(cartTotal/100).toFixed(2)}</span></div>
          {quickAdjustItem && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm font-semibold">Quick quantity: {quickAdjustItem.product.name}</p>
            <div className="grid grid-cols-3 gap-2">{[1,2,5].map(amount => <Button key={amount} variant="secondary" disabled={!canSelectMenu || cartState.issues.some(issue => issue.variantId === quickAdjustItem.variant.id) || remainingPOSCapacity(quickAdjustItem.variant,liveCart) < amount} onClick={() => adjustQuickItem(amount)}>+{amount}</Button>)}</div>
          </div>}
          {hasPendingTerminalSession && !terminalCollecting && <Notice tone="attention"><p>A saved payment is unresolved. Check it before taking another payment. Reader reset does not clear the payment.</p>
            <div className="mt-2 flex flex-col gap-2"><Button variant="secondary" onClick={() => void (selectedTerminal?.provider === 'stripe' && !simulationActive ? handleCancelActiveTerminalPrompt() : handleCancelSavedPayment())}>Cancel Reader Prompt</Button>
              <Button variant="secondary" onClick={handleCheckSavedPayment}>Check saved payment</Button><Button variant="ghost" onClick={handleCancelSavedPayment}>Cancel saved payment</Button></div>
          </Notice>}
          <TerminalControls compact {...paymentTerminal} busy={terminalCollecting} locked={submitting}
            pending={hasPendingTerminalSession ? {orderNumber:savedPayment?.order_number,attemptId:savedPayment?.attempt_id,terminalId:savedPayment?.terminal_id,state:savedPayment?.payment_state} : null} />
          {hasPendingTerminalSession && savedPayment?.collection_mode === 'terminal' && <Button variant="secondary" className="w-full" disabled={terminalCollecting} onClick={() => void handleResumeReaderPayment()}>Resume reader payment</Button>}
          {selectedTerminal?.provider === 'stripe' && !simulationActive && (terminalReader || hasPendingTerminalSession || terminalCollecting || terminalError) && <Button variant="secondary" className="w-full" loading={resettingReader} disabled={terminalCollecting} onClick={handleResetReaderSession}>Reset Reader Session</Button>}
          {lastOrder && <CompletedSale order={lastOrder} onDismiss={() => setLastOrder(null)} />}
          {simulationActive && <StatusBadge tone="attention">Simulated card payment</StatusBadge>}
          <div aria-label="Payment choices" className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" ref={cashButtonRef} icon={<Banknote />} onClick={() => setShowCashModal(true)} disabled={!canSubmitPayment}>Cash</Button>
            <Button size="lg" icon={<Smartphone />} loading={terminalCollecting} onClick={handleCardAction} disabled={!canSubmitPayment || !selectedTerminal?.collectable || (!terminalReader && selectedTerminal.provider === 'stripe' && !simulationActive) || !terminalLocationReady}>Card</Button>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => void handleManualCardAction()} disabled={!canSubmitPayment}>Use hosted card form</Button>
          {terminalCollecting && <Button variant="secondary" className="w-full" onClick={() => void (selectedTerminal?.provider === 'stripe' && !simulationActive ? handleCancelActiveTerminalPrompt() : handleCancelSavedPayment())}>Cancel Tap/Insert</Button>}
          {lastAddedItem && cart.length > 0 && <div className="space-y-1"><p className="text-xs">Last item: {lastAddedItem.product.name}</p><Button variant="secondary" className="w-full" disabled={!canSelectMenu || !allItems.some(item => item.id === lastAddedItem.product.id && item.variants.some(variant => variant.id === lastAddedItem.variant.id && variant.in_stock))} onClick={() => addToCart(lastAddedItem.product,lastAddedItem.variant)}>Add last item again</Button></div>}
          <p className="text-xs text-slate-600">Search `/` · Type F2 · Cash F8 · Card F9 · Qty [ ] \</p>
          {terminalError && <Notice tone="danger" role="alert">{terminalError}</Notice>}
          {cart.length > 0 && <Button variant="ghost" className="w-full" onClick={clearCart}>Clear Cart</Button>}
          {simulationActive && SimulatedTerminalPanel && <Suspense fallback={null}><SimulatedTerminalPanel locationId={selectedLocation ?? null} attemptId={simulatedAttempt} terminalId={selectedTerminalId} onSelect={selectTerminal} getToken={getToken} onChange={handleCheckSavedPayment} /></Suspense>}
        </div>
      </div>
      {manualSession && <ManualCardDialog sessionId={manualSession} getToken={getToken} onClose={() => setManualSession(null)} onCheck={handleCheckSavedPayment} />}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-300 bg-white px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] md:hidden"><Button className="w-full" onClick={() => {cartRef.current?.scrollIntoView();cartRef.current?.focus({preventScroll:true});}}>View cart · {cartCount} items · ${(cartTotal/100).toFixed(2)}</Button></div>
      {showCashModal && <CashModal totalCents={cartTotal} submitting={submitting} returnFocusRef={cashButtonRef} onComplete={cashReceivedCents => submitOrder('cash',cashReceivedCents)} onClose={() => setShowCashModal(false)} />}
      {variantPickerProduct && canSelectMenu && <VariantPickerModal returnFocusRef={variantOpenerRef} product={allItems.find(item => item.id === variantPickerProduct.id) || variantPickerProduct}
        onSelect={variant => {addToCart(variantPickerProduct,variant);setVariantPickerProduct(null);}} onClose={() => setVariantPickerProduct(null)} />}
      {showReaderPicker && <ReaderPickerDialog readers={availableReaders} connected={terminalReader} busy={terminalCollecting || terminalStatus === 'connecting' || terminalStatus === 'discovering'} error={terminalError} returnFocusRef={readerButtonRef}
        onClose={() => setShowReaderPicker(false)} onConnect={reader => void handleConnectReader(reader)} onDisconnect={() => void handleDisconnectReader()} onDiscover={() => void handleDiscoverReaders()} />}
    </div>
  );
}
