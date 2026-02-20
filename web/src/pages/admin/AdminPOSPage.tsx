import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import {
  ArrowLeft, Search, ShoppingCart, Plus, Minus, Trash2,
  Banknote, MapPin, Check, X, ChefHat, AlertCircle,
  Wifi, WifiOff, Loader2, Smartphone, CreditCard
} from 'lucide-react';
import ManualCardEntry from '../../components/admin/ManualCardEntry';
import type { ManualPaymentResult } from '../../components/admin/ManualCardEntry';
import {
  initializeTerminal,
  discoverReaders,
  connectToReader,
  collectPayment,
  cancelPaymentCollection,
  disconnectReader,
  resetTerminalSession,
  onStatusChange,
  destroyTerminal,
  setTokenProvider,
  type TerminalStatus,
} from '../../services/stripeTerminal';
import type { Reader } from '@stripe/terminal-js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface POSVariant {
  id: number;
  name: string;
  price_cents: number;
  price_formatted: string;
  sku: string;
  in_stock: boolean;
  stock_quantity: number;
}

interface POSProduct {
  id: number;
  name: string;
  slug: string;
  product_type: string;
  image_url: string | null;
  variants: POSVariant[];
}

interface POSCategory {
  name: string;
  items: POSProduct[];
}

interface POSLocation {
  id: number;
  name: string;
  address: string;
}

interface CartItem {
  cartId: string;
  product: POSProduct;
  variant: POSVariant;
  quantity: number;
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

async function fetchPOSMenu(token: string, locationId?: number): Promise<{ categories: POSCategory[]; locations: POSLocation[] }> {
  const params = new URLSearchParams();
  if (locationId) params.set('location_id', locationId.toString());
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/menu?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load menu');
  return res.json();
}

async function createPOSOrder(token: string, orderData: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order: orderData }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create order');
  return data;
}

async function confirmTerminalPayment(token: string, orderId: number) {
  const res = await fetch(`${API_BASE}/api/v1/admin/pos/orders/${orderId}/confirm_terminal_payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to confirm terminal payment');
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

// ─── Stripe Elements Setup ──────────────────────────────────────────────────

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

// ─── Main POS Page ──────────────────────────────────────────────────────────

export default function AdminPOSPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  // Data
  const [categories, setCategories] = useState<POSCategory[]>([]);
  const [locations, setLocations] = useState<POSLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<number | undefined>();

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [orderType, setOrderType] = useState<'pickup' | 'dine_in'>('pickup');
  const [quickAdjustVariantId, setQuickAdjustVariantId] = useState<number | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<{ product: POSProduct; variant: POSVariant } | null>(null);
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);

  // Modals
  const [variantPickerProduct, setVariantPickerProduct] = useState<POSProduct | null>(null);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showManualCardModal, setShowManualCardModal] = useState(false);
  const [manualCardClientSecret, setManualCardClientSecret] = useState<string | null>(null);
  const [manualCardOrderId, setManualCardOrderId] = useState<number | null>(null);
  const [manualCardApiToken, setManualCardApiToken] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ order_number: string; total_formatted: string; change_due_formatted?: string; card_brand?: string; card_last4?: string } | null>(null);

  // Terminal
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('not_initialized');
  const [terminalReader, setTerminalReader] = useState<Reader | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showReaderPicker, setShowReaderPicker] = useState(false);
  const [availableReaders, setAvailableReaders] = useState<Reader[]>([]);
  const [terminalCollecting, setTerminalCollecting] = useState(false);
  const [hasPendingTerminalSession, setHasPendingTerminalSession] = useState(false);

  // ─── Load menu ──────────────────────────────────────────────────────────

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const data = await fetchPOSMenu(token, selectedLocation);
      setCategories(data.categories);
      setLocations(data.locations);
      if (!selectedLocation && data.locations.length > 0) {
        setSelectedLocation(data.locations[0].id);
      }
    } catch (err) {
      console.error('Failed to load POS menu:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedLocation]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // ─── Filtered items ─────────────────────────────────────────────────────

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const filteredItems = useMemo(() => {
    let items = activeCategory === 'All'
      ? allItems
      : categories.find((c) => c.name === activeCategory)?.items || [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }

    return items;
  }, [allItems, categories, activeCategory, searchQuery]);

  const categoryNames = useMemo(() => ['All', ...categories.map((c) => c.name)], [categories]);
  const selectedLocationName = useMemo(
    () => locations.find((loc) => loc.id === selectedLocation)?.name ?? 'Select location',
    [locations, selectedLocation]
  );

  // ─── Cart logic ─────────────────────────────────────────────────────────

  const addToCart = useCallback((product: POSProduct, variant: POSVariant) => {
    setCart((prev) => {
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
  }, []);

  const handleProductClick = useCallback((product: POSProduct) => {
    const availableVariants = product.variants.filter((v) => v.in_stock);
    if (availableVariants.length === 0) return;
    if (availableVariants.length === 1) {
      addToCart(product, availableVariants[0]);
    } else {
      setVariantPickerProduct(product);
    }
  }, [addToCart]);

  const updateQuantity = useCallback((variantId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.variant.id === variantId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((variantId: number) => {
    setCart((prev) => prev.filter((c) => c.variant.id !== variantId));
  }, []);

  const quickAdjustItem = useMemo(
    () => cart.find((item) => item.variant.id === quickAdjustVariantId) ?? null,
    [cart, quickAdjustVariantId]
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
    () => cart.reduce((sum, c) => sum + c.variant.price_cents * c.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity, 0),
    [cart]
  );
  const terminalLabel = terminalReader ? 'Connected' : 'Offline';
  const connectedReaderName = terminalReader
    ? (getReaderMeta(terminalReader).label || getReaderMeta(terminalReader).serial_number || 'Unknown Reader')
    : null;
  const canSubmitPayment = cart.length > 0 && !submitting && !terminalCollecting;

  const focusSearchField = useCallback(() => {
    const target = desktopSearchRef.current ?? mobileSearchRef.current;
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
    if (terminalStatus === 'connecting' || terminalStatus === 'discovering') return;
    try {
      setTerminalError(null);
      const connected = await connectToReader(reader);
      setTerminalReader(connected);
      setShowReaderPicker(false);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [terminalStatus]);

  const handleDiscoverReaders = useCallback(async () => {
    if (terminalStatus === 'connecting' || terminalStatus === 'discovering') return;
    try {
      setTerminalError(null);
      await initializeTerminal();
      const readers = await discoverReaders();
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
  }, [handleConnectReader, terminalStatus]);

  const handleReaderButtonClick = useCallback(async () => {
    if (terminalStatus === 'connecting' || terminalStatus === 'discovering') return;

    if (!terminalReader) {
      await handleDiscoverReaders();
      return;
    }

    try {
      setTerminalError(null);
      await initializeTerminal();
      const readers = await discoverReaders();
      setAvailableReaders(readers);
      setShowReaderPicker(true);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Reader refresh failed');
    }
  }, [terminalReader, terminalStatus, handleDiscoverReaders]);

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
      localStorage.removeItem(POS_PENDING_TERMINAL_KEY);
      setHasPendingTerminalSession(false);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Unable to cancel reader prompt');
    }
  }, []);

  const clearPendingTerminalSession = useCallback(() => {
    localStorage.removeItem(POS_PENDING_TERMINAL_KEY);
    setHasPendingTerminalSession(false);
  }, []);

  const handleResetReaderSession = useCallback(async () => {
    try {
      setTerminalError(null);
      await resetTerminalSession();
      setTerminalReader(null);
      setAvailableReaders([]);
      setShowReaderPicker(false);
      clearPendingTerminalSession();
      setTerminalCollecting(false);
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Failed to reset reader session');
    }
  }, [clearPendingTerminalSession]);

  const handleTerminalPayment = useCallback(async () => {
    if (cart.length === 0 || terminalCollecting) return;
    setTerminalCollecting(true);
    setTerminalError(null);

    try {
      const token = await getToken();
      if (!token) return;

      // 1. Create order with card_present payment method
      const orderData = {
        customer_name: customerName || 'Walk-in',
        order_type: orderType,
        payment_method: 'card_present',
        location_id: selectedLocation,
        items: cart.map((c) => ({
          product_variant_id: c.variant.id,
          quantity: c.quantity,
        })),
      };

      const orderResult = await createPOSOrder(token, orderData);

      if (!orderResult.client_secret) {
        throw new Error('No client secret returned — check Stripe configuration');
      }

      localStorage.setItem(POS_PENDING_TERMINAL_KEY, JSON.stringify({
        order_id: orderResult.id,
        order_number: orderResult.order_number,
        amount_cents: cartTotal,
        created_at: new Date().toISOString(),
      }));
      setHasPendingTerminalSession(true);

      // 2. Collect payment via terminal reader
      await collectPayment(orderResult.client_secret);

      // 3. Confirm payment on backend (retry up to 3 times — card was already charged)
      let confirmed;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          confirmed = await confirmTerminalPayment(token, orderResult.id);
          break;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (confirmed) {
        setLastOrder(confirmed);
        clearCart();
        setTimeout(() => setLastOrder(null), 4000);
        localStorage.removeItem(POS_PENDING_TERMINAL_KEY);
        setHasPendingTerminalSession(false);
      } else {
        // Payment succeeded on terminal but confirmation failed — DO NOT clear cart
        // so staff can see what was ordered. Show order number for manual recovery.
        alert(
          `⚠️ Card was charged but order ${orderResult.order_number} couldn't be confirmed automatically.\n\n` +
          `Order ID: ${orderResult.id}\n` +
          `Please check Stripe Dashboard and confirm the order manually.`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terminal payment failed';
      setTerminalError(message);
      alert(message);
    } finally {
      setTerminalCollecting(false);
    }
  }, [cart, customerName, orderType, selectedLocation, getToken, clearCart, terminalCollecting, cartTotal]);

  // ─── Submit order ───────────────────────────────────────────────────────

  const submitOrder = useCallback(
    async (paymentMethod: 'cash' | 'stripe', cashReceivedCents?: number) => {
      if (cart.length === 0) return;
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

        const result = await createPOSOrder(token, orderData);
        setLastOrder(result);
        setShowCashModal(false);
        clearCart();

        // Auto-dismiss success after 4s
        setTimeout(() => setLastOrder(null), 4000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Order failed';
        alert(message);
      } finally {
        setSubmitting(false);
      }
    },
    [cart, customerName, orderType, selectedLocation, getToken, clearCart]
  );

  // ─── Manual Card Entry ─────────────────────────────────────────────────

  const handleManualCardEntry = useCallback(async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const orderData: Record<string, unknown> = {
        customer_name: customerName || 'Walk-in',
        order_type: orderType,
        payment_method: 'card_manual',
        location_id: selectedLocation,
        items: cart.map((c) => ({
          product_variant_id: c.variant.id,
          quantity: c.quantity,
        })),
      };

      const result = await createPOSOrder(token, orderData);
      // result.client_secret has the PaymentIntent secret for Stripe.js
      if (result.client_secret) {
        setManualCardClientSecret(result.client_secret);
        setManualCardOrderId(result.id);
        setManualCardApiToken(token);
        setShowManualCardModal(true);
      } else {
        throw new Error('No client secret returned — Stripe may not be configured');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      alert(message);
    } finally {
      setSubmitting(false);
    }
  }, [cart, customerName, orderType, selectedLocation, getToken]);

  const handleManualCardSuccess = useCallback((result: ManualPaymentResult) => {
    setShowManualCardModal(false);
    setManualCardClientSecret(null);
    setManualCardOrderId(null);
    setLastOrder({
      order_number: `Order #${result.orderId}`,
      total_formatted: `$${(cartTotal / 100).toFixed(2)}`,
      card_brand: result.brand,
      card_last4: result.last4,
    });
    clearCart();
    setTimeout(() => setLastOrder(null), 4000);
  }, [cartTotal, clearCart]);

  const handleCardAction = useCallback(() => {
    if (!canSubmitPayment) return;
    if (!terminalReader) {
      setTerminalError('Connect a Stripe reader before taking card payments.');
      void handleDiscoverReaders();
      return;
    }
    void handleTerminalPayment();
  }, [canSubmitPayment, terminalReader, handleTerminalPayment, handleDiscoverReaders]);

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

      if (event.key === 'F10' && canSubmitPayment) {
        event.preventDefault();
        handleManualCardEntry();
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading POS...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-linear-to-br from-slate-100 via-white to-slate-100 overflow-hidden">
      {/* ── Left Panel: Menu ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors -ml-2 text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-tsNavy text-white flex items-center justify-center shadow-sm">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 whitespace-nowrap">POS Mode</h1>
              <p className="text-xs text-slate-500 truncate">{selectedLocationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Location selector */}
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              <select
                value={selectedLocation || ''}
                onChange={(e) => setSelectedLocation(Number(e.target.value))}
                className="bg-transparent text-slate-700 text-sm outline-none cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id} className="text-slate-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative hidden lg:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={desktopSearchRef}
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
              />
            </div>

            {/* Terminal status */}
            <button
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
            </button>
          </div>
        </header>

        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2 items-center">
          <div className="md:hidden w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary"
              />
            </div>
          </div>
          <div className="md:hidden w-full">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              <select
                value={selectedLocation || ''}
                onChange={(e) => setSelectedLocation(Number(e.target.value))}
                className="w-full bg-transparent text-slate-700 text-sm outline-none cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id} className="text-slate-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
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

        {/* Category tabs */}
        {!searchQuery && (
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
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-white">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const hasStock = item.variants.some((v) => v.in_stock);
                const price = item.variants[0]?.price_formatted || '';
                const inCartQuantity = cart
                  .filter((c) => c.product.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                const inCart = inCartQuantity > 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleProductClick(item)}
                    disabled={!hasStock}
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
      <div className="w-80 lg:w-104 bg-white/95 backdrop-blur border-l border-slate-200 flex flex-col shrink-0">
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
              {cart.map((item) => (
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
                        onClick={() => updateQuantity(item.variant.id, -1)}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variant.id, 1)}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
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
              <span className="text-xs text-slate-500">Payment due</span>
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
                  onClick={() => adjustQuickItem(1)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  +1
                </button>
                <button
                  onClick={() => adjustQuickItem(2)}
                  className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  +2
                </button>
                <button
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
                A previous terminal payment session may still be active on the reader.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelActiveTerminalPrompt}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  Cancel Reader Prompt
                </button>
                <button
                  onClick={clearPendingTerminalSession}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  Clear Notice
                </button>
              </div>
            </div>
          )}

          {(terminalReader || hasPendingTerminalSession || terminalCollecting) && (
            <button
              onClick={handleResetReaderSession}
              className="w-full mb-2 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
            >
              Reset Reader Session
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 mb-2">
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
              disabled={!canSubmitPayment || !terminalReader}
              className="flex items-center justify-center gap-2 py-3 text-white rounded-xl font-medium bg-tsNavy hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {terminalCollecting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : terminalReader ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
              {terminalCollecting ? 'Tap Card...' : terminalReader ? 'Tap Card' : 'No Reader'}
            </button>
            <button
              onClick={handleManualCardEntry}
              disabled={!canSubmitPayment || submitting}
              className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CreditCard className="w-5 h-5" />
              Type Card
            </button>
          </div>

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
            <span>Tap `F9`</span>
            <span>Type `F10`</span>
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
              {lastOrder.card_brand && lastOrder.card_last4 && ` — ${lastOrder.card_brand.toUpperCase()} ****${lastOrder.card_last4}`}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showCashModal && (
        <CashModal
          totalCents={cartTotal}
          onComplete={(cashReceivedCents) => submitOrder('cash', cashReceivedCents)}
          onClose={() => setShowCashModal(false)}
        />
      )}

      {showManualCardModal && manualCardClientSecret && manualCardOrderId && (
        <Elements stripe={stripePromise} options={{ clientSecret: manualCardClientSecret }}>
          <ManualCardEntry
            clientSecret={manualCardClientSecret}
            totalCents={cartTotal}
            orderId={manualCardOrderId}
            onSuccess={handleManualCardSuccess}
            onClose={async () => {
              // Cancel the abandoned order to restore inventory
              if (manualCardOrderId && manualCardApiToken) {
                try {
                  await fetch(`${API_BASE}/api/v1/admin/orders/${manualCardOrderId}/cancel`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${manualCardApiToken}`,
                      'Content-Type': 'application/json',
                    },
                  });
                } catch {
                  // Best effort — order stays pending if cancel fails
                }
              }
              setShowManualCardModal(false);
              setManualCardClientSecret(null);
              setManualCardOrderId(null);
              setManualCardApiToken('');
            }}
            apiToken={manualCardApiToken}
          />
        </Elements>
      )}

      {variantPickerProduct && (
        <VariantPickerModal
          product={variantPickerProduct}
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
