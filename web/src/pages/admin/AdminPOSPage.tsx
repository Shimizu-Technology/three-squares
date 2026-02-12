import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft, Search, ShoppingCart, Plus, Minus, Trash2,
  Banknote, CreditCard, MapPin, Check, X, ChefHat, AlertCircle
} from 'lucide-react';

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

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

  // Modals
  const [variantPickerProduct, setVariantPickerProduct] = useState<POSProduct | null>(null);
  const [showCashModal, setShowCashModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ order_number: string; total_formatted: string; change_due_formatted?: string } | null>(null);

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

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName('Walk-in');
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.variant.price_cents * c.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity, 0),
    [cart]
  );

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

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading POS...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* ── Left Panel: Menu ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-tsNavy text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors -ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <ChefHat className="w-6 h-6" />
            <h1 className="text-lg font-semibold">POS Mode</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Location selector */}
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <MapPin className="w-4 h-4 text-white/60" />
              <select
                value={selectedLocation || ''}
                onChange={(e) => setSelectedLocation(Number(e.target.value))}
                className="bg-transparent text-white text-sm outline-none cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id} className="text-gray-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
          </div>
        </header>

        {/* Category tabs */}
        {!searchQuery && (
          <div className="flex gap-1.5 p-2 bg-white border-b border-gray-200 overflow-x-auto shrink-0">
            {categoryNames.map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                  activeCategory === name
                    ? 'bg-tsPrimary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        <div className="flex-1 overflow-auto p-3">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {filteredItems.map((item) => {
                const hasStock = item.variants.some((v) => v.in_stock);
                const price = item.variants[0]?.price_formatted || '';
                const inCart = cart.some((c) => c.product.id === item.id);

                return (
                  <button
                    key={item.id}
                    onClick={() => handleProductClick(item)}
                    disabled={!hasStock}
                    className={`p-3 rounded-xl text-left transition-all min-h-[80px] border-2 ${
                      inCart
                        ? 'border-tsPrimary bg-yellow-50 shadow-sm'
                        : hasStock
                        ? 'border-transparent bg-white hover:shadow-md hover:border-yellow-300'
                        : 'border-transparent bg-gray-100 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="font-medium text-gray-900 line-clamp-2 mb-1 text-sm">
                      {item.name}
                    </div>
                    <div className="text-tsPrimary font-semibold text-sm">{price}</div>
                    {!hasStock && (
                      <span className="text-xs text-red-500 mt-1">Sold Out</span>
                    )}
                    {inCart && (
                      <div className="mt-1">
                        <Check className="w-4 h-4 text-tsPrimary inline" />
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
      <div className="w-80 lg:w-96 bg-white border-l border-gray-200 flex flex-col shrink-0">
        {/* Customer + order type */}
        <div className="p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer Name"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-tsPrimary"
            />
          </div>
          <div className="flex gap-2">
            {(['pickup', 'dine_in'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  orderType === type
                    ? 'bg-tsPrimary text-white'
                    : 'bg-gray-100 text-gray-600'
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
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.variant.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">
                        {item.product.name}
                      </div>
                      {item.variant.name !== 'Default' && (
                        <div className="text-xs text-gray-500">{item.variant.name}</div>
                      )}
                    </div>
                    <div className="text-right ml-2">
                      <div className="font-semibold text-tsPrimary text-sm">
                        ${((item.variant.price_cents * item.quantity) / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.variant.id, -1)}
                        className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variant.id, 1)}
                        className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
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
        <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600">
              Total <span className="text-xs text-gray-400">({cartCount} items)</span>
            </span>
            <span className="text-2xl font-bold text-gray-900">
              ${(cartTotal / 100).toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => setShowCashModal(true)}
              disabled={cart.length === 0 || submitting}
              className="flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Banknote className="w-5 h-5" />
              Cash
            </button>
            <button
              onClick={() => submitOrder('stripe')}
              disabled={cart.length === 0 || submitting}
              className="flex items-center justify-center gap-2 py-3 bg-tsPrimary text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CreditCard className="w-5 h-5" />
              Card
            </button>
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="w-full py-2 text-gray-400 text-sm hover:text-red-500 transition-colors"
            >
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* ── Success Toast ───────────────────────────────────────────────── */}
      {lastOrder && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in">
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

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showCashModal && (
        <CashModal
          totalCents={cartTotal}
          onComplete={(cashReceivedCents) => submitOrder('cash', cashReceivedCents)}
          onClose={() => setShowCashModal(false)}
        />
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
    </div>
  );
}
