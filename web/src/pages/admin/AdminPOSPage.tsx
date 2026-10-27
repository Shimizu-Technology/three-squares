import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '@clerk/clerk-react';
import { StaffAccessProvider, StaffAccessDenied, useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import {
  ArrowLeft, Search, ShoppingCart, Plus, Minus, Trash2,
  Banknote, MapPin, Check, X, ChefHat, AlertCircle,
  Wifi, WifiOff, Loader2, Smartphone
} from 'lucide-react';
import {
  initializeTerminal,
  discoverReaders,
  connectToReader,
  collectPayment,
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
import PaymentReceipt from '../../components/payment/PaymentReceipt';
import TerminalControls from '../../components/payment/TerminalControls';
import ManualCardDialog from '../../components/payment/ManualCardDialog';
import type { PaymentReceiptFacts } from '../../types/paymentReceipt';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { reconcilePOSCart, remainingPOSCapacity, type POSProduct, type POSVariant, type POSCategory, type CartItem } from '../../components/admin/posCart';
import type { Reader } from '@stripe/terminal-js';

const locationLabel = (name: string) => name.replace(/^Three Squares\s*(?:@\s*)?/i, '').trim() || name;

const SimulatedTerminalPanel = import.meta.env.DEV ? lazy(() => import('../../components/payment/simulation/SimulatedTerminalPanel')) : null;

// ─── Types ──────────────────────────────────────────────────────────────────

interface POSLocation {
  id: number;
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


async function fetchPOSMenu(token: string, locationId?: number): Promise<{ categories: POSCategory[]; locations: POSLocation[] }> {
  const params = new URLSearchParams();
  if (locationId) params.set('location_id', locationId.toString());
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

async function confirmTerminalPayment(token: string, orderId: number, allowClosed = false) {
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/orders/${orderId}/confirm_terminal_payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (res.ok && allowClosed && ['failed', 'cancelled', 'compensated'].includes(data.payment_state)) return data;
  if (!res.ok || data.payment_status !== 'paid' || !data.inventory_committed) throw new Error(data.error || 'Payment status is being checked. Keep this saved order; do not collect another payment.');
  return data;
}

// ─── Cash Modal ─────────────────────────────────────────────────────────────

function CashModal({
  totalCents,
  onComplete,
  onClose,
}: {
  totalCents: number;
  onComplete: (cashReceivedCents: number) => void;
  onClose: () => void;
}) {
  const totalDollars = totalCents / 100;
  const [cashInput, setCashInput] = useState(totalDollars.toFixed(2));
  const cashReceived = parseFloat(cashInput) || 0;
  const changeDue = cashReceived - totalDollars;

  const denominations = [5, 10, 20, 50, 100];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Cash Payment</h3>
            <p className="text-2xl font-bold text-tsPrimary mt-1">${totalDollars.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Quick denomination buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Amount</label>
            <div className="grid grid-cols-3 gap-2">
              {denominations.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCashInput(amt.toFixed(2))}
                  className={`py-3 rounded-lg text-sm font-semibold transition-colors border-2 ${
                    cashInput === amt.toFixed(2)
                      ? 'border-tsPrimary bg-yellow-50 text-tsPrimary'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  ${amt}
                </button>
              ))}
              <button
                onClick={() => setCashInput(totalDollars.toFixed(2))}
                className={`py-3 rounded-lg text-sm font-semibold transition-colors border-2 ${
                  cashInput === totalDollars.toFixed(2)
                    ? 'border-tsPrimary bg-yellow-50 text-tsPrimary'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                Exact
              </button>
            </div>
          </div>

          {/* Custom input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cash Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
              <input
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

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={() => onComplete(Math.round(cashReceived * 100))}
            disabled={cashReceived < totalDollars}
            className="w-full py-4 bg-amber-500 text-white rounded-xl text-lg font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Banknote className="w-5 h-5" />
            Complete Cash Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Variant Picker Modal ───────────────────────────────────────────────────

function VariantPickerModal({
  product,
  onSelect,
  onClose,
}: {
  product: POSProduct;
  onSelect: (variant: POSVariant) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {product.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              disabled={!v.in_stock}
              className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
                v.in_stock
                  ? 'border-gray-200 hover:border-tsPrimary hover:bg-yellow-50'
                  : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
              }`}
            >
              <span className="font-medium">{v.name}</span>
              <span className="font-semibold text-tsPrimary">{v.price_formatted}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main POS Page ──────────────────────────────────────────────────────────

export default function AdminPOSPage() {
  return <StaffAccessProvider><POSAccessGate /></StaffAccessProvider>;
}

function POSAccessGate() {
  const access = useStaffAccess();
  if (access.loading) return <div role="status" className="p-6">Checking POS access…</div>;
  if (access.error) return <div role="alert" className="space-y-4 p-6"><p>POS access could not be checked.</p><button type="button" onClick={() => void access.reload()} className="btn-primary min-h-11">Retry access check</button></div>;
  if (!access.user) return <div className="space-y-4 p-6"><p>Sign in to use POS.</p><SignInButton mode="modal"><button className="btn-primary min-h-11">Sign in</button></SignInButton></div>;
  return access.can('pos.sell') ? <AdminPOSWorkspace /> : <StaffAccessDenied />;
}

function AdminPOSWorkspace() {
  const access = useStaffAccess();
  const navigate = useNavigate();
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
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ order_number: string; total_formatted: string; change_due_formatted?: string; payment_receipt?: PaymentReceiptFacts | null } | null>(null);

  // Terminal
  const [terminalLocationReady, setTerminalLocationReady] = useState(false);
  const [resettingReader, setResettingReader] = useState(false);
  const [savedPayment, setSavedPayment] = useState(savedPOSPayment);
  const [manualSession, setManualSession] = useState<string | null>(null);
  const paymentTerminal = usePaymentTerminal({ locationId: selectedLocation, getToken });
  const { selected: selectedTerminal, selectedId: selectedTerminalId, select: selectTerminal, terminals: paymentTerminals, loading: readersLoading } = paymentTerminal;
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
  }, [userId, selectedLocation, selectedTerminalId, selectTerminal, paymentTerminals, readersLoading]);
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

  const loadMenu = useCallback(async () => {
    if (!menuActive.current) return;
    const generation = ++menuRequest.current;
    setLoading(true);
    setVariantPickerProduct(null);
    try {
      const token = await getToken();
      if (generation !== menuRequest.current || selectedLocationRef.current !== selectedLocation) return;
      if (!token) throw new Error('Sign in to load the POS menu');
      const data = await fetchPOSMenu(token, selectedLocation);
      if (generation !== menuRequest.current || selectedLocationRef.current !== selectedLocation) return;
      if (!Array.isArray(data.locations) || !Array.isArray(data.categories)) throw new Error('Invalid POS menu response');
      setLocations(data.locations);
      if (selectedLocation === undefined) {
        if (!data.locations.length) throw new Error('No POS locations available');
        // The unscoped response only discovers locations. Never offer its menu.
        setSelectedLocation(data.locations[0].id);
        return;
      }
      if (!data.locations.some(location => location.id === selectedLocation)) throw new Error('Selected POS location unavailable');
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
  }, [getToken, selectedLocation]);

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

    return items;
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

  const handleProductClick = useCallback((product: POSProduct) => {
    if (!canSelectMenu) return;
    const availableVariants = product.variants.filter(variant => remainingPOSCapacity(variant, liveCart) > 0);
    if (availableVariants.length === 0) return;
    if (availableVariants.length === 1) {
      addToCart(product, availableVariants[0]);
    } else {
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
  const terminalLabel = simulationActive ? 'Simulated reader' : selectedTerminal?.provider === 'worldpay' ? selectedTerminal.status.replaceAll('_', ' ') : terminalReader ? 'Connected' : 'Offline';
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
  }, [access, selectedTerminal?.provider, handleConnectReader, terminalStatus, terminalLocationReady]);

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
      setLastOrder(confirmed);
      clearCart();
      clearPendingTerminalSession();
    } catch (error) {
      setHasPendingTerminalSession(Boolean(localStorage.getItem(POS_PENDING_TERMINAL_KEY)));
      setTerminalError(error instanceof Error ? error.message : 'Payment remains unresolved.');
    }
  }, [getToken, userId, clearCart, clearPendingTerminalSession, selectTerminal]);

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
    }
  }, [getToken, userId, clearCart, clearPendingTerminalSession]);

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
      await startTerminalPayment({ token, orderId: order.id, terminalId: order.payment_terminal_id, key: posRequest.key });
      await paymentTerminal.reload();
      if (order.payment_environment === 'simulated' || order.payment_provider === 'worldpay') return;
      if (!terminalReader || getReaderMeta(terminalReader).id !== selectedTerminal.terminal_id) throw new Error('Reconnect the original registered reader before collecting.');
      if (!order.client_secret) throw new Error('Card collection is unavailable. Check the saved payment.');
      await collectPayment(order.client_secret);
      const confirmed = await confirmTerminalPayment(token, order.id);
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
      await startTerminalPayment({ token, orderId: order.id, terminalId: order.payment_terminal_id, key: posRequest.key });
      setTerminalError('Original reader payment resumed. Check its status before taking another payment.');
      await paymentTerminal.reload();
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : 'Reader payment remains unresolved.');
    } finally { setTerminalCollecting(false); }
  }, [getToken, userId, paymentTerminal]);

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

        // Auto-dismiss success after 4s
        setTimeout(() => setLastOrder(null), 4000);
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
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 md:h-dvh flex flex-col md:flex-row bg-linear-to-br from-slate-100 via-white to-slate-100 md:overflow-hidden">
      {simulationActive && SimulatedTerminalPanel && <Suspense fallback={null}><SimulatedTerminalPanel locationId={selectedLocation ?? null} attemptId={simulatedAttempt} terminalId={selectedTerminalId} onSelect={selectTerminal} getToken={getToken} onChange={handleCheckSavedPayment} /></Suspense>}
      {/* ── Left Panel: Menu ────────────────────────────────────────────── */}
      <div ref={menuRef} tabIndex={-1} aria-label="POS menu" className="flex h-[65dvh] shrink-0 flex-col min-h-0 min-w-0 md:h-auto md:flex-1">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/admin')}
              aria-label="Exit POS to staff workspace"
              className="min-h-11 min-w-11 p-2 hover:bg-slate-100 rounded-lg transition-colors -ml-2 text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex w-10 h-10 shrink-0 rounded-xl bg-tsNavy text-white flex items-center justify-center shadow-sm">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 style={{ fontSize: '1.125rem', lineHeight: '1.5rem' }} className="font-semibold text-slate-900">POS</h1>
              <p className="text-xs text-slate-500 truncate">{access.roleLabel} · {access.scopeLabel} · {selectedLocationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Terminal status */}
            {access.can('payments.terminals.discover') && selectedTerminal?.provider === 'stripe' && !simulationActive && <button
              onClick={handleReaderButtonClick}
              disabled={terminalStatus === 'connecting' || terminalStatus === 'discovering'}
              className={`flex items-center justify-center gap-2 min-w-34 px-3 py-2 rounded-lg text-sm border transition-colors ${
                terminalReader
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={terminalReader ? `Connected: ${getReaderMeta(terminalReader).label || getReaderMeta(terminalReader).serial_number}` : 'Click to connect reader'}
            >
              {terminalStatus === 'discovering' || terminalStatus === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : terminalReader ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              <span className="hidden xl:inline">Reader {terminalLabel}</span>
            </button>}
          </div>
        </header>

        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2 items-center">
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block min-w-0 text-xs font-semibold text-slate-600">Sale location
              <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                <select aria-label="Sale location" title={locations.find(location => location.id === selectedLocation)?.name} disabled={access.user?.operational_scope === 'specific' || hasPendingTerminalSession || submitting || terminalCollecting || resettingReader || ['connecting', 'discovering', 'initializing'].includes(terminalStatus)} value={selectedLocation || ''} onChange={event => setSelectedLocation(Number(event.target.value))} className="min-h-11 min-w-0 w-full bg-transparent text-base text-slate-900">
                  {locations.map(location => <option key={location.id} value={location.id}>{locationLabel(location.name)}</option>)}
                </select>
              </span>
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-600">Find a menu item
              <span className="relative mt-1 block">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input ref={searchRef} type="search" placeholder="Search menu..." value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-tsPrimary" />
              </span>
            </label>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            <ShoppingCart className="w-3.5 h-3.5" />
            {cartCount} items
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-tsPrimary/10 text-tsNavy">
            {orderType === 'dine_in' ? 'Dine in' : 'Pickup'}
          </span>
          {connectedReaderName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 max-w-[16rem] truncate">
              <Wifi className="w-3.5 h-3.5 shrink-0" />
              {connectedReaderName}
            </span>
          )}
          {terminalError && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
              <AlertCircle className="w-3.5 h-3.5" />
              Reader issue
            </span>
          )}
        </div>

        <div className="shrink-0 px-4 pt-3">
          <AdminRequestState resource="POS menu and locations" loading={loading} error={loadError} hasData={hasMenu} onRetry={() => void loadMenu()} />
          {!loading && !loadError && hasMenu && (
            <button type="button" onClick={() => void loadMenu()} className="btn-secondary min-h-[44px]">Refresh menu</button>
          )}
        </div>

        {/* Category tabs */}
        {hasMenu && !searchQuery && (
          <div className="flex gap-2 px-4 py-3 bg-white border-b border-slate-200 overflow-x-auto shrink-0">
            {categoryNames.map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                  activeCategory === name
                    ? 'bg-tsNavy text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        <div className="flex-1 overflow-auto p-4">
          {!hasMenu || (filteredItems.length === 0 && (loading || loadError)) ? null : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-white">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const hasStock = item.variants.some(variant => variant.in_stock);
                const canAdd = item.variants.some(variant => remainingPOSCapacity(variant, liveCart) > 0);
                const price = item.variants[0]?.price_formatted || '';
                const inCartQuantity = cart
                  .filter((c) => c.product.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                const inCart = inCartQuantity > 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleProductClick(item)}
                    disabled={!canAdd || !canSelectMenu}
                    className={`p-3.5 rounded-2xl text-left transition-all min-h-[112px] border ${
                      inCart
                        ? 'border-tsPrimary/40 bg-tsPrimary/5 shadow-sm'
                        : hasStock
                        ? 'border-slate-200 bg-white hover:shadow-md hover:border-tsPrimary/30'
                        : 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="font-medium text-slate-900 line-clamp-2 mb-1 text-sm">
                      {item.name}
                    </div>
                    <div className="text-tsNavy font-semibold text-sm">{price}</div>
                    {!hasStock && (
                      <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">Sold Out</span>
                    )}
                    {hasStock && !canAdd && <span className="mt-2 inline-flex text-xs font-semibold text-slate-700">Stock limit in cart</span>}
                    {inCart && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        In cart ({inCartQuantity})
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: Cart ───────────────────────────────────────────── */}
      <div ref={cartRef} tabIndex={-1} aria-label="Current sale" className="min-h-0 w-full md:w-80 lg:w-104 bg-white/95 backdrop-blur border-l border-slate-200 flex flex-col shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 md:hidden">
          <h2 className="text-lg font-semibold">Current sale</h2>
          <button type="button" onClick={() => { menuRef.current?.scrollIntoView(); searchRef.current?.focus({ preventScroll: true }); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold">Back to menu</button>
        </div>
        {/* Customer + order type */}
        <div className="p-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer Name"
              className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
            />
          </div>
          <div className="flex gap-2 p-1 rounded-xl bg-slate-100">
            {(['pickup', 'dine_in'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  orderType === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                {type === 'dine_in' ? 'Dine In' : 'Pickup'}
              </button>
            ))}
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-slate-50">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add</p>
            </div>
          ) : (
            <div className="space-y-3">
              {liveCart.map((item) => (
                <div
                  key={item.variant.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setQuickAdjustVariantId(item.variant.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setQuickAdjustVariantId(item.variant.id);
                    }
                  }}
                  className={`w-full text-left bg-slate-50 rounded-xl p-3 border transition-colors ${
                    quickAdjustVariantId === item.variant.id
                      ? 'border-tsPrimary/50 bg-tsPrimary/5'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 text-sm truncate">
                        {item.product.name}
                      </div>
                      {item.variant.name !== 'Default' && (
                        <div className="text-xs text-slate-500">{item.variant.name}</div>
                      )}
                    </div>
                    <div className="text-right ml-2">
                      <div className="font-semibold text-tsNavy text-sm">
                        ${((item.variant.price_cents * item.quantity) / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Decrease quantity for ${item.product.name}`}
                        onClick={() => updateQuantity(item.variant.id, -1)}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        disabled={!canSelectMenu || cartState.issues.some(issue => issue.variantId === item.variant.id) || remainingPOSCapacity(item.variant, liveCart) < 1}
                        aria-label={`Increase quantity for ${item.product.name}`}
                        onClick={() => updateQuantity(item.variant.id, 1)}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      aria-label={`Remove ${item.product.name}`}
                      onClick={() => removeFromCart(item.variant.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart footer */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          {cart.length > 0 && (!canSelectMenu || cartState.issues.length > 0) && <div role="alert" className="mb-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            {!canSelectMenu ? <p>Load the current location menu before taking payment. Your cart is still here.</p> : cartState.issues.map(issue => <p key={issue.variantId}>{issue.message}</p>)}
          </div>}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-sm">
                Subtotal <span className="text-xs text-slate-400">({cartCount} items)</span>
              </span>
              <span className="text-lg font-semibold text-slate-900">
                ${(cartTotal / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Prices for {selectedLocationName}</span>
              <span className="text-2xl font-bold text-slate-900">
                ${(cartTotal / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {quickAdjustItem && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Quick Qty Mode</p>
                <p className="text-sm font-medium text-slate-800 truncate">
                  {quickAdjustItem.product.name}
                  {quickAdjustItem.variant.name !== 'Default' ? ` — ${quickAdjustItem.variant.name}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <button
                  onClick={() => adjustQuickItem(-1)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  -1
                </button>
                <button
                  disabled={!canSelectMenu || !allItems.some(product => product.variants.some(variant => variant.id === quickAdjustItem.variant.id && variant.in_stock))}
                  onClick={() => adjustQuickItem(1)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  +1
                </button>
                <button
                  disabled={!canSelectMenu || !allItems.some(product => product.variants.some(variant => variant.id === quickAdjustItem.variant.id && variant.in_stock))}
                  onClick={() => adjustQuickItem(2)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  +2
                </button>
                <button
                  disabled={!canSelectMenu || !allItems.some(product => product.variants.some(variant => variant.id === quickAdjustItem.variant.id && variant.in_stock))}
                  onClick={() => adjustQuickItem(5)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  +5
                </button>
                <button
                  onClick={removeQuickItem}
                  className="py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 transition-colors"
                >
                  Del
                </button>
              </div>
            </div>
          )}

          {hasPendingTerminalSession && !terminalCollecting && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-2">
                A saved payment is unresolved. Check it before taking another payment. Reader reset does not clear the payment.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelActiveTerminalPrompt}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  Cancel Reader Prompt
                </button>
                <button
                  onClick={handleCheckSavedPayment}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  Check saved payment
                </button>
                <button onClick={handleCancelSavedPayment} className="px-3 py-2 text-xs underline">Cancel saved payment</button>
              </div>
            </div>
          )}

          {lastOrder?.payment_receipt && <PaymentReceipt receipt={lastOrder.payment_receipt} orderReference={lastOrder.order_number} onPrint={() => window.print()} />}
          <TerminalControls {...paymentTerminal} busy={terminalCollecting} locked={submitting}
            pending={hasPendingTerminalSession ? { orderNumber: savedPayment?.order_number, attemptId: savedPayment?.attempt_id, terminalId: savedPayment?.terminal_id, state: savedPayment?.payment_state } : null} />
          {hasPendingTerminalSession && savedPayment?.collection_mode === 'terminal' && <button type="button" disabled={terminalCollecting} onClick={() => void handleResumeReaderPayment()} className="min-h-11 w-full rounded-lg border p-2 text-sm">Resume original reader payment</button>}
          {selectedTerminal?.provider === 'stripe' && !simulationActive && (terminalReader || hasPendingTerminalSession || terminalCollecting || terminalError) && (
            <button
              onClick={handleResetReaderSession}
              disabled={resettingReader || terminalCollecting}
              className="w-full mb-2 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
            >
              Reset Reader Session
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => setShowCashModal(true)}
              disabled={!canSubmitPayment}
              className="flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Banknote className="w-5 h-5" />
              Cash
            </button>
            <button
              onClick={handleCardAction}
              disabled={!canSubmitPayment || !selectedTerminal?.collectable || (!terminalReader && selectedTerminal.provider === 'stripe' && !simulationActive) || !terminalLocationReady}
              className="flex items-center justify-center gap-2 py-3 text-white rounded-xl font-medium bg-tsNavy hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {terminalCollecting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : terminalReader ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
              {terminalCollecting ? 'Tap Card...' : simulationActive ? 'Card (simulated)' : selectedTerminal?.provider === 'worldpay' ? 'Card on reader' : terminalReader ? 'Tap Card' : 'Connect Reader'}
            </button>
          </div>

          <button type="button" onClick={() => void handleManualCardAction()} disabled={!canSubmitPayment} className="min-h-11 w-full rounded-lg border p-2 text-sm disabled:opacity-50">Use hosted card form</button>

          {terminalCollecting && (
            <button
              onClick={handleCancelActiveTerminalPrompt}
              className="w-full mb-2 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 transition-colors"
            >
              Cancel Tap/Insert
            </button>
          )}

          {lastAddedItem && cart.length > 0 && (
            <button
              disabled={!canSelectMenu || !allItems.some(item => item.id === lastAddedItem.product.id && item.variants.some(variant => variant.id === lastAddedItem.variant.id && variant.in_stock))}
              onClick={() => addToCart(lastAddedItem.product, lastAddedItem.variant)}
              className="w-full mb-2 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors text-left truncate"
              title={`Add again: ${lastAddedItem.product.name}${lastAddedItem.variant.name !== 'Default' ? ` (${lastAddedItem.variant.name})` : ''}`}
            >
              + Add last item again: {lastAddedItem.product.name}
            </button>
          )}

          <div className="mb-2 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span>Search `/`</span>
            <span>Toggle type `F2`</span>
            <span>Cash `F8`</span>
            <span>Card `F9`</span>
            <span>Qty `[` `]` `\`</span>
            <span>Reader: tap status chip</span>
          </div>

          {terminalError && (
            <div className="mb-2 p-2.5 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {terminalError}
            </div>
          )}

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="w-full py-2 text-slate-400 text-sm hover:text-rose-500 transition-colors"
            >
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* ── Success Toast ───────────────────────────────────────────────── */}
      {lastOrder && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in">
          <Check className="w-6 h-6" />
          <div>
            <div className="font-semibold">Order {lastOrder.order_number} Created!</div>
            <div className="text-sm opacity-90">
              {lastOrder.total_formatted}
              {lastOrder.change_due_formatted && ` — Change: ${lastOrder.change_due_formatted}`}
            </div>
          </div>
        </div>
      )}

      {manualSession && <ManualCardDialog sessionId={manualSession} getToken={getToken} onClose={() => setManualSession(null)} onCheck={handleCheckSavedPayment} />}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-300 bg-white px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] md:hidden">
        <button type="button" onClick={() => { cartRef.current?.scrollIntoView(); cartRef.current?.focus({ preventScroll: true }); }} className="flex min-h-11 w-full items-center justify-between rounded-lg bg-tsNavy px-4 font-semibold text-white"><span>View cart · {cartCount} items</span><span>${(cartTotal / 100).toFixed(2)}</span></button>
      </div>

      {showCashModal && (
        <CashModal
          totalCents={cartTotal}
          onComplete={(cashReceivedCents) => submitOrder('cash', cashReceivedCents)}
          onClose={() => setShowCashModal(false)}
        />
      )}

      {variantPickerProduct && canSelectMenu && (
        <VariantPickerModal
          product={allItems.find(item => item.id === variantPickerProduct.id) || variantPickerProduct}
          onSelect={(variant) => {
            addToCart(variantPickerProduct, variant);
            setVariantPickerProduct(null);
          }}
          onClose={() => setVariantPickerProduct(null)}
        />
      )}

      {/* ── Reader Picker Modal ─────────────────────────────────────────── */}
      {showReaderPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Card Reader</h3>
              <button onClick={() => setShowReaderPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {terminalReader && (
              <div className="mb-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-emerald-700 font-medium">Currently connected</p>
                  <p className="text-sm text-emerald-900 truncate">
                    {getReaderMeta(terminalReader).label || getReaderMeta(terminalReader).serial_number}
                  </p>
                </div>
                <button
                  onClick={handleDisconnectReader}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  Disconnect
                </button>
              </div>
            )}

            {availableReaders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <WifiOff className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No readers found</p>
                <p className="text-sm mt-1">Make sure the S700 is powered on and connected to WiFi</p>
                <button
                  onClick={handleDiscoverReaders}
                  className="mt-4 px-4 py-2 bg-tsPrimary text-white rounded-lg text-sm hover:opacity-90"
                >
                  Scan Again
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {availableReaders.map((reader, index) => (
                  <button
                    key={getReaderMeta(reader).id || getReaderMeta(reader).serial_number || `reader-${index}`}
                    onClick={() => handleConnectReader(reader)}
                    className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <Smartphone className="w-5 h-5 text-tsPrimary" />
                    <div className="text-left">
                      <div className="font-medium">{getReaderMeta(reader).label || getReaderMeta(reader).serial_number}</div>
                      <div className="text-xs text-gray-500">{getReaderMeta(reader).device_type}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {terminalError && (
              <div className="mt-3 p-2 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {terminalError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
