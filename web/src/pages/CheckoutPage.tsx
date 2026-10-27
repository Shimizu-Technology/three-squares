import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useCartStore } from '../store/cartStore';
import { configApi, locationsApi, shippingApi, formatPrice } from '../services/api';
import { checkoutApi, checkoutClientConfiguration, checkoutCapability, pendingCheckout, saveCheckout, clearPendingCheckout } from '../services/checkout';
import { authGet } from '../services/authApi';
import { checkoutContactReducer, emptyCheckoutContact } from '../lib/checkoutContact';
import { hostedPageUrl, collectionAvailable } from '../lib/hostedPage';
import { readPendingCreation, savePendingCreation, clearPendingCreation, creationRejected } from '../lib/checkoutCreation';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardPaymentHandle } from '../components/payment/PaymentForm';
import PaymentForm, { type CollectionConfiguration } from '../components/payment/PaymentCollectionForm';
import type { ShippingAddress, ShippingMethod, AppConfig } from '../types/order';
import type { Location } from '../services/api';
import PlaceholderImage from '../components/ui/PlaceholderImage';
import OptimizedImage from '../components/ui/OptimizedImage';
import { useLocationStore } from '../store/locationStore';

function CheckoutForm() {
  const navigate = useNavigate();
  const { getToken, isSignedIn, isLoaded: authLoaded, userId } = useAuth();
  const { cart, sessionId, fetchCart, validateCart, removeItem, isLoading: cartLoading, isRepricing, pricingError } = useCartStore();
  const { selectedLocation: storedLocation, setSelectedLocation } = useLocationStore();
  const paymentForm = useRef<CardPaymentHandle>(null);
  const checkoutCompleted = useRef(false);
  const [savedClientConfig, setSavedClientConfig] = useState<CollectionConfiguration | null>(null);
  const [locationClientConfig, setLocationClientConfig] = useState<CollectionConfiguration | null>(null);

  // Get items from cart (with fallback to empty array)
  const items = cart?.items || [];
  const subtotalCents = cart?.subtotal_cents || 0; // Use cents directly from cart
  const cartSupportsPickup = items.length > 0 && items.every((item) => item.product.allow_pickup === true);

  // App config
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const cartSupportsShipping = appConfig?.enable_storefront_latte_stone === true && items.length > 0 && items.every((item) => item.product.allow_shipping === true);

  // Form state
  const [contact, updateContact] = useReducer(checkoutContactReducer, emptyCheckoutContact);
  const { name, email, phone } = contact.values;
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('pickup');
  const [pickupLocations, setPickupLocations] = useState<Location[]>([]);
  const pickupLocationId = storedLocation?.id ?? null;
  useEffect(() => {
    let active = true;
    setLocationClientConfig(null);
    void configApi.getConfig(deliveryMethod === 'pickup' ? pickupLocationId : null).then(config => {
      if (active) setLocationClientConfig(config);
    }).catch(() => {});
    return () => { active = false; };
  }, [deliveryMethod, pickupLocationId]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  // Shipping
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod | null>(null);
  const [availableShippingRates, setAvailableShippingRates] = useState<ShippingMethod[]>([]);
  const [calculatingShipping, setCalculatingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // Payment state
  const [paymentReady, setPaymentReady] = useState(false);

  // Notes / special instructions
  const [orderNotes, setOrderNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState<Record<number, string>>({});
  const [expandedInstructions, setExpandedInstructions] = useState<Record<number, boolean>>({});

  // Clean up stale specialInstructions/expandedInstructions when cart items change
  useEffect(() => {
    if (!cart?.items) return;
    const validIds = new Set(cart.items.map((item: { id: number }) => item.id));
    setSpecialInstructions((prev) => {
      const next: Record<number, string> = {};
      for (const [id, val] of Object.entries(prev)) {
        if (validIds.has(Number(id))) next[Number(id)] = val;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    setExpandedInstructions((prev) => {
      const next: Record<number, boolean> = {};
      for (const [id, val] of Object.entries(prev)) {
        if (validIds.has(Number(id))) next[Number(id)] = val;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [cart?.items]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('tsq-checkout-draft') || 'null');
      if (saved && saved.expires > Date.now()) {
        for (const field of ['name', 'email', 'phone'] as const) updateContact({ type: 'edit', field, value: saved.contact[field] || '' });
        setOrderNotes(saved.orderNotes || '');
        setSpecialInstructions(saved.instructions || {});
        setShippingAddress(saved.shippingAddress);
        setDeliveryMethod(saved.deliveryMethod === 'shipping' ? 'shipping' : 'pickup');
      }
    } catch { sessionStorage.removeItem('tsq-checkout-draft'); }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (draftLoaded && !checkoutCompleted.current) sessionStorage.setItem('tsq-checkout-draft', JSON.stringify({ expires: Date.now() + 2 * 60 * 60 * 1000, contact: contact.values, orderNotes, instructions: specialInstructions, shippingAddress, deliveryMethod }));
    setReviewed(false);
  }, [draftLoaded, contact.values, orderNotes, specialInstructions, shippingAddress, deliveryMethod, pickupLocationId, subtotalCents, shippingMethod]);

  // Loading/error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<Array<{
    cart_item_id: number;
    type: string;
    message: string;
    item_name: string;
    action?: string;
  }> | null>(null);

  // Environment labels never grant payment authority.
  const activeClientConfig = savedClientConfig || locationClientConfig;
  const isSandbox = activeClientConfig?.payment_environment === 'sandbox';
  const submitting = useRef(false);
  const creationKey = useRef(crypto.randomUUID());
  const capability = useRef(checkoutCapability());
  const [resolvedWithoutPayment, setResolvedWithoutPayment] = useState(false);
  const [canRetryCollection, setCanRetryCollection] = useState(false);
  const [savedAmountReviewed, setSavedAmountReviewed] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(pendingCheckout);
  const [creationPending, setCreationPending] = useState(() => !!readPendingCreation());
  const [creationRetry, setCreationRetry] = useState(0);

  useEffect(() => {
    if (!creationPending || !authLoaded) return;
    const saved = readPendingCreation();
    if (!saved) { setCreationPending(false); return; }
    if (saved.owner !== (userId || 'guest')) {
      setError('Sign in with the account that started this checkout to recover its saved payment.');
      return;
    }
    let stopped = false;
    void (async () => {
      try {
        const token = isSignedIn ? await getToken() : null;
        if (isSignedIn && !token) throw new Error('Sign in again to recover this checkout.');
        const state = await checkoutApi.create(saved.order, token, saved.capability, saved.key, saved.cartSession);
        if (stopped) return;
        saveCheckout(state, saved.capability, saved.key, saved.owner === 'guest');
        clearPendingCreation(); setCreationPending(false);
        setSavedClientConfig(checkoutClientConfiguration(state)); setPendingPayment(pendingCheckout());
      } catch (error) {
        if (!stopped && creationRejected(error)) {
          clearPendingCreation(); setCreationPending(false); setReviewed(false);
          setError('The checkout was not created. Review your cart and availability before paying.');
        } else if (!stopped) setError('We could not recover the checkout response yet. Check again before starting another payment.');
      }
    })();
    return () => { stopped = true; };
  }, [creationPending, creationRetry, authLoaded, userId, isSignedIn, getToken]);

  const finishCheckout = useCallback(async (state: Awaited<ReturnType<typeof checkoutApi.show>>) => {
    if (state.order.payment_status === 'paid' && state.order.inventory_committed) {
      clearPendingCheckout();
      checkoutCompleted.current = true;
      sessionStorage.removeItem('tsq-checkout-draft');
      await fetchCart();
      navigate(`/orders/${state.order.id}`);
      return true;
    }
    return false;
  }, [fetchCart, navigate]);

  useEffect(() => {
    if (!pendingPayment || !authLoaded) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const poll = async () => {
      try {
        const token = isSignedIn ? await getToken() : null;
        const state = await checkoutApi.confirm(pendingPayment.id, token, pendingPayment.capability);
        if (stopped || await finishCheckout(state)) return;
        setSavedClientConfig(checkoutClientConfiguration(state));
        setResolvedWithoutPayment(['failed', 'cancelled', 'compensated'].includes(state.payment_state));
        setCanRetryCollection((state.payment_state === 'collecting' && !!state.collection_config.client_secret) || !!hostedPageUrl(state));
        setError(['failed', 'cancelled', 'compensated'].includes(state.payment_state) ? `Payment closed for order ${state.order.order_number}. No payment is due on this saved attempt. Review your cart before starting again.` : `Payment status is being checked for order ${state.order.order_number}. Your order is saved. Keep this page or check your order before paying again.`);
        if (Date.now() - started < 90000) timer = setTimeout(poll, Date.now() - started < 10000 ? 2000 : 10000);
      } catch {
        if (!stopped) {
          setError('Your order is saved. We could not check payment status yet. Use Check payment status before paying again.');
          if (Date.now() - started < 90000) timer = setTimeout(poll, 10000);
        }
      }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [pendingPayment, authLoaded, isSignedIn, getToken, finishCheckout]);

  // Compatible pickup locations = intersection of available_location_ids across all cart items.
  const compatiblePickupLocationIds = useMemo(() => {
    if (items.length === 0) return [];
    const itemLocationSets = items
      .map((item) => item.product.available_location_ids || [])
      .filter((ids) => ids.length > 0);
    if (itemLocationSets.length === 0) return [];
    return itemLocationSets.reduce(
      (intersection, ids) => intersection.filter((id) => ids.includes(id)),
      itemLocationSets[0]
    );
  }, [items]);

  const compatiblePickupLocations = useMemo(
    () => pickupLocations.filter((location) => compatiblePickupLocationIds.includes(location.id)),
    [pickupLocations, compatiblePickupLocationIds]
  );

  // A profile response may arrive after sign-out or an identity change.
  useEffect(() => {
    const identity = authLoaded && isSignedIn ? userId : null;
    updateContact({ type: 'identity', identity });
    if (!identity) return;
    let cancelled = false;

    authGet<{
      email: string | null;
      name: string | null;
      phone: string | null;
    }>('/me', getToken)
      .then(({ data: profile }) => {
        if (cancelled) return;
        updateContact({ type: 'profile', identity, profile });
      })
      .catch(() => {
        // Checkout remains usable when profile loading fails.
      });

    return () => { cancelled = true; };
  }, [isSignedIn, authLoaded, userId, getToken]);

  // Load app config
  useEffect(() => {
    let active = true;
    const initialLocationId = useLocationStore.getState().selectedLocation?.id;
    const loadConfig = async () => {
      try {
        const config = await configApi.getConfig();
        if (!active) return;
        setAppConfig(config);
        const locations = await locationsApi.getLocations();
        if (!active) return;
        const locs = locations.locations || [];
        setPickupLocations(locs);
        const current = useLocationStore.getState().selectedLocation;
        // A newer user choice wins over this mount-time initialization.
        if (current?.id !== initialLocationId) return;
        const location = locs.find((item) => item.id === current?.id) || locs[0];
        if (location) setSelectedLocation(location);
      } catch (err) {
        if (active) console.error('Failed to load config:', err);
      } finally {
        if (active) setConfigLoading(false);
      }
    };
    void loadConfig();
    return () => { active = false; };
  }, [setSelectedLocation]);

  // Every summary refresh uses the same explicit fulfillment/destination context.
  // The store discards stale responses; payment stays blocked until it matches.
  useEffect(() => {
    if (!configLoading) void fetchCart({ fulfillment_type: deliveryMethod, location_id: deliveryMethod === 'pickup' ? pickupLocationId : null });
  }, [configLoading, deliveryMethod, pickupLocationId, fetchCart]);

  useEffect(() => () => { void fetchCart(null); }, [fetchCart]);

  const priceContextMatches = cart?.pricing_context?.fulfillment_type === deliveryMethod
    && (deliveryMethod === 'shipping' || cart.pricing_context.location_id === pickupLocationId);
  const pricePending = configLoading || isRepricing || !priceContextMatches;

  // Redirect if cart is empty (but wait for cart to load first!)
  useEffect(() => {
    // Only redirect if cart has loaded AND is empty
    if (!cartLoading && cart !== null && items.length === 0 && !configLoading && !pendingPayment && !pendingCheckout() && !submitting.current) {
      navigate('/products');
    }
  }, [cartLoading, cart, items.length, navigate, configLoading, pendingPayment]);

  // Keep delivery method aligned with cart fulfillment capabilities
  useEffect(() => {
    if (items.length === 0) return;

    if (!cartSupportsShipping && deliveryMethod === 'shipping' && cartSupportsPickup) {
      setDeliveryMethod('pickup');
      setShippingMethod(null);
      setAvailableShippingRates([]);
      return;
    }

    if (!cartSupportsPickup && deliveryMethod === 'pickup' && cartSupportsShipping) {
      setDeliveryMethod('shipping');
      return;
    }
  }, [items.length, cartSupportsShipping, cartSupportsPickup, deliveryMethod]);

  useEffect(() => {
    if (deliveryMethod !== 'pickup') return;
    if (compatiblePickupLocations.length === 0) return;

    const hasValidCurrentLocation =
      pickupLocationId !== null && compatiblePickupLocationIds.includes(pickupLocationId);
    if (!hasValidCurrentLocation) {
      setSelectedLocation(compatiblePickupLocations[0]);
    }
  }, [deliveryMethod, pickupLocationId, compatiblePickupLocationIds, compatiblePickupLocations, setSelectedLocation]);

  // Calculate shipping rates
  const handleCalculateShipping = async () => {
    if (!cartSupportsShipping) {
      setShippingError('Shipping is not available for all items in your cart.');
      return;
    }

    if (!shippingAddress.street1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
      setShippingError('Please fill out all required shipping address fields');
      return;
    }

    setCalculatingShipping(true);
    setShippingError(null);

    try {
      let token: string | null = null;
      if (isSignedIn && authLoaded) {
        token = await getToken();
      }

      const response = await shippingApi.calculateRates(
        {
          ...shippingAddress,
          name: shippingAddress.name || name,
          country: shippingAddress.country || 'US',
        },
        sessionId,
        token
      );

      setAvailableShippingRates(response.rates);
      if (response.rates.length > 0) {
        setShippingMethod(response.rates[0]); // Auto-select first option
      }
    } catch (err: unknown) {
      console.error('Shipping calculation error:', err);
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setShippingError(axiosErr.response?.data?.error || 'Failed to calculate shipping. Please try again.');
    } finally {
      setCalculatingShipping(false);
    }
  };

  // Handle payment ready state from PaymentForm
  const handlePaymentReady = useCallback((ready: boolean) => {
    setPaymentReady(ready);
  }, []);

  // Check if all required fields are filled
  const isFormValid = () => {
    if (pricePending || pricingError) return false;
    const hasContactInfo = name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';

    if (deliveryMethod === 'pickup') {
      if (!cartSupportsPickup) return false;
      if (compatiblePickupLocations.length === 0) return false;
      return hasContactInfo && pickupLocationId !== null && paymentReady;
    }

    if (!cartSupportsShipping) return false;

    // For shipping, need address and shipping method selected
    const hasAddress =
      shippingAddress.street1.trim() !== '' &&
      shippingAddress.city.trim() !== '' &&
      shippingAddress.state.trim() !== '' &&
      shippingAddress.zip.trim() !== '';

    return hasContactInfo && hasAddress && shippingMethod !== null && paymentReady;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || pendingPayment || creationPending || pricePending || pricingError || !reviewed) return;
    submitting.current = true;
    setError(null);
    setValidationIssues(null);
    setLoading(true);

    try {
      // HAF-118: Pre-checkout cart validation to catch sync issues
      // This ensures we catch any stale/phantom items before attempting payment
      const validation = await validateCart();
      if (validation.issues && validation.issues.length > 0) {
        // Show validation issues and refresh cart to sync
        setValidationIssues(validation.issues);
        await fetchCart(); // Refresh cart to show all items including problematic ones
        setLoading(false);
        return; // Don't proceed until issues are resolved
      }

      // Get auth token if signed in
      let token: string | null = null;
      if (isSignedIn && authLoaded) {
        token = await getToken();
        if (!token) throw new Error('Sign in again before starting checkout.');
      }

      // Build shipping data
      if (deliveryMethod === 'shipping' && !cartSupportsShipping) {
        setError('Shipping is not available for all items in your cart.');
        setLoading(false);
        return;
      }
      if (deliveryMethod === 'pickup' && !cartSupportsPickup) {
        setError('Pickup is not available for all items in your cart.');
        setLoading(false);
        return;
      }
      if (deliveryMethod === 'pickup' && compatiblePickupLocations.length === 0) {
        setError('Your cart items are not available at a common pickup location. Please update your cart.');
        setLoading(false);
        return;
      }

      let orderShippingAddress;
      let orderShippingMethod;

      if (deliveryMethod === 'shipping') {
        if (!shippingMethod) {
          setError('Please select a shipping method');
          setLoading(false);
          return;
        }
        orderShippingAddress = { ...shippingAddress, name };
        orderShippingMethod = shippingMethod;
      } else {
        orderShippingAddress = {
          name,
          street1: 'Pickup',
          city: 'Hagåtña',
          state: 'GU',
          zip: '96910',
          country: 'US',
        };
        orderShippingMethod = {
          carrier: 'PICKUP',
          service: 'In-Store Pickup',
          rate_cents: 0,
        };
      }

      // Build item special instructions (only non-empty)
      const itemInstructions: Record<string, string> = {};
      for (const [cartItemId, text] of Object.entries(specialInstructions)) {
        if (text.trim()) {
          itemInstructions[cartItemId] = text.trim();
        }
      }

      const orderData = {
        customer_name: name, email, phone, fulfillment_type: deliveryMethod,
        location_id: deliveryMethod === 'pickup' ? pickupLocationId || undefined : undefined,
        shipping_address: orderShippingAddress, shipping_method: orderShippingMethod,
        notes: orderNotes.trim() || undefined,
        item_special_instructions: Object.keys(itemInstructions).length ? itemInstructions : undefined,
      };
      savePendingCreation({ order: orderData, key: creationKey.current, capability: capability.current, cartSession: sessionId, owner: userId || 'guest' });
      const state = await checkoutApi.create(orderData, token, capability.current, creationKey.current, sessionId);
      saveCheckout(state, capability.current, creationKey.current, !token);
      clearPendingCreation();
      setSavedClientConfig(checkoutClientConfiguration(state));
      if (state.amount_cents !== subtotalCents + (deliveryMethod === 'pickup' ? 0 : (shippingMethod?.rate_cents || 0))) {
        setPendingPayment(pendingCheckout());
        throw new Error('The saved order total changed. Review its amount before continuing payment.');
      }
      const hostedUrl = hostedPageUrl(state);
      if (hostedUrl) {
        window.location.assign(hostedUrl);
        return;
      }
      if (!['stripe_embedded', 'simulated_fields'].includes(state.flow || '') || !state.collection_config.client_secret) {
        setPendingPayment(pendingCheckout());
        throw new Error('Your order is saved. Payment collection is being prepared; check its status before starting again.');
      }
      const { error: stripeError } = await paymentForm.current!.confirm(state.collection_config.client_secret, state.collection_config.payment_identity_id, { name, email, phone });
      // Even an SDK/network error can have a late approval. Resume the saved
      // session rather than creating a second payment against a mutable cart.
      if (stripeError) setError(stripeError.message || 'Payment status is being checked.');
      const confirmed = await checkoutApi.confirm(state.id, token, capability.current);
      if (!(await finishCheckout(confirmed))) setPendingPayment(pendingCheckout());
    } catch (err: unknown) {
      const saved = pendingCheckout();
      if (saved) setPendingPayment(saved);
      console.error('Checkout error:', err);
      const axiosErr = err as { response?: { data?: { error?: string; issues?: Array<{ message: string }> } } };
      // A definite validation rejection has no saved financial intent. Network
      // loss and server failures retain the original key across back/reload.
      if (creationRejected(err)) clearPendingCreation();
      else if (!saved && readPendingCreation()) setCreationPending(true);
      if (axiosErr.response?.data?.issues && axiosErr.response.data.issues.length > 0) {
        const issues = axiosErr.response.data.issues;
        const errorMessages = issues.map((issue) => `• ${issue.message}`).join('\n');
        setError(`Unable to complete order:\n${errorMessages}`);
      } else {
        setError(axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'An error occurred. Please try again.'));
      }
    } finally {
      submitting.current = false;
      if (pendingCheckout()) setPendingPayment(pendingCheckout());
      setLoading(false);
    }
  };

  // Calculate total
  const shippingCostCents = deliveryMethod === 'pickup' ? 0 : (shippingMethod?.rate_cents || 0);
  const totalCents = subtotalCents + shippingCostCents;

  if (creationPending && !pendingPayment) return <div className="mx-auto max-w-xl p-6" role="status">
    <h1 className="text-xl font-semibold">Checking your saved checkout</h1>
    <p className="mt-3">Your cart and payment request are saved on this device. Check the original request before starting another payment.</p>
    {error && <p className="mt-3" role="alert">{error}</p>}
    <button type="button" className="mt-4 min-h-11 underline" onClick={() => setCreationRetry(value => value + 1)}>Check saved checkout</button>
  </div>;

  if (configLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading checkout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center sm:text-left">
          <span className="inline-block text-tsPrimary font-semibold text-sm uppercase tracking-wider mb-2">
            Secure Checkout
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Complete Your Order</h1>
          <p className="text-gray-500 mt-2">Fill in the details below to complete your purchase</p>
        </div>

        {/* Test Mode Banner */}
        {isSandbox && (
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-yellow-600 mr-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="font-semibold text-yellow-800 mb-1">Sandbox payments</h3>
                <p className="text-sm text-yellow-700">
                  Stripe sandbox is selected. No real payments will be processed.
                  Orders will be created for testing purposes only.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2">
            {pendingPayment && <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4" role="status">
              <p className="font-semibold">Your order {pendingPayment.orderNumber || pendingPayment.orderId} is saved{pendingPayment.amountCents !== undefined ? ` for $${(pendingPayment.amountCents / 100).toFixed(2)}` : ''}. {resolvedWithoutPayment ? 'Payment is closed. Review your cart before starting again.' : 'Payment status is being checked.'}</p>
              <button type="button" className="mt-3 underline" onClick={async () => {
                try {
                  const token = isSignedIn ? await getToken() : null;
                  const state = await checkoutApi.confirm(pendingPayment.id, token, pendingPayment.capability);
                  if (!(await finishCheckout(state))) {
                    setResolvedWithoutPayment(['failed', 'cancelled', 'compensated'].includes(state.payment_state));
                    setSavedClientConfig(checkoutClientConfiguration(state));
                    setCanRetryCollection((state.payment_state === 'collecting' && !!state.collection_config.client_secret) || !!hostedPageUrl(state));
                    setError(`Payment status: ${state.payment_state}. Order ${state.order.order_number} remains saved.`);
                  }
                } catch { setError('We could not check payment status. Your order remains saved.'); }
              }}>Check payment status</button>
              {import.meta.env.DEV && savedClientConfig?.payment_environment === 'simulated' && <button type="button" className="mt-3 block min-h-11 underline" onClick={async () => {
                try {
                  const state = await checkoutApi.advanceSimulation(pendingPayment.id, isSignedIn ? await getToken() : null, pendingPayment.capability);
                  if (!(await finishCheckout(state))) { setResolvedWithoutPayment(['failed', 'cancelled', 'compensated'].includes(state.payment_state)); setError(`Simulation payment status: ${state.payment_state}`); }
                } catch { setError('Simulation time could not advance. Your payment remains saved.'); }
              }}>Advance simulated time by 61 seconds</button>}
              {canRetryCollection && <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={savedAmountReviewed} onChange={event => setSavedAmountReviewed(event.target.checked)} />I have reviewed the saved order total{pendingPayment.amountCents !== undefined ? ` of $${(pendingPayment.amountCents / 100).toFixed(2)}` : ''}.</label>}
              {canRetryCollection && <button type="button" className="ml-4 mt-3 underline" disabled={loading || !paymentReady || !savedAmountReviewed} onClick={async () => {
                if (submitting.current) return;
                submitting.current = true;
                setLoading(true);
                try {
                  const token = isSignedIn ? await getToken() : null;
                  const state = await checkoutApi.show(pendingPayment.id, token, pendingPayment.capability);
                  const hostedUrl = hostedPageUrl(state);
                  if (hostedUrl) { window.location.assign(hostedUrl); return; }
                  if (!state.collection_config.client_secret || state.payment_state !== 'collecting') throw new Error('Payment status changed. Check the saved order.');
                  setSavedClientConfig(checkoutClientConfiguration(state));
                  if (!paymentForm.current) throw new Error('Card collection is not ready. Check the saved order.');
                  const result = await paymentForm.current.confirm(state.collection_config.client_secret, state.collection_config.payment_identity_id, { name, email, phone });
                  if (result.error) setError(result.error.message || 'Card payment could not complete.');
                  const confirmed = await checkoutApi.confirm(state.id, token, pendingPayment.capability);
                  if (!(await finishCheckout(confirmed))) setPendingPayment(pendingCheckout());
                } catch (error) { setError(error instanceof Error ? error.message : 'Payment status is being checked.'); }
                finally { submitting.current = false; setLoading(false); }
              }}>Retry card payment for this saved order</button>}
              {!resolvedWithoutPayment && <button type="button" className="mt-3 block underline" disabled={loading} onClick={async () => {
                try {
                  const token = isSignedIn ? await getToken() : null;
                  const state = await checkoutApi.cancel(pendingPayment.id, token, pendingPayment.capability);
                  if (!(await finishCheckout(state))) {
                    setResolvedWithoutPayment(['failed', 'cancelled', 'compensated'].includes(state.payment_state));
                    setCanRetryCollection(false);
                    setError(`Payment status: ${state.payment_state}. Your order remains saved.`);
                  }
                } catch { setError('Cancellation is not confirmed. Check the saved payment before starting another.'); }
              }}>Cancel saved payment</button>}
              {resolvedWithoutPayment && <button type="button" className="mt-3 block underline" onClick={() => {
                clearPendingCheckout(); setSavedClientConfig(null); setPendingPayment(null); setResolvedWithoutPayment(false); setCanRetryCollection(false);
                creationKey.current = crypto.randomUUID(); capability.current = checkoutCapability(); setError(null);
              }}>Payment closed — review cart and start again</button>}
              <button type="button" className="ml-4 mt-3 underline" onClick={() => navigate(`/orders/${pendingPayment.orderId}`)}>View saved order</button>
            </div>}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Contact Information */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Contact Information</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={name}
                      onChange={(e) => updateContact({ type: 'edit', field: 'name', value: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={email}
                      onChange={(e) => updateContact({ type: 'edit', field: 'email', value: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Phone *
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      required
                      value={phone}
                      onChange={(e) => updateContact({ type: 'edit', field: 'phone', value: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Method */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{cartSupportsShipping ? 'Delivery Method' : 'Pickup Details'}</h2>
                </div>
                <div className={`grid grid-cols-1 ${cartSupportsShipping && cartSupportsPickup ? 'sm:grid-cols-2' : ''} gap-4`}>
                  {cartSupportsShipping && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('shipping');
                      setShippingMethod(null);
                      setAvailableShippingRates([]);
                    }}
                    className={`p-5 border-2 rounded-xl transition-all ${
                      deliveryMethod === 'shipping'
                        ? 'border-tsPrimary bg-red-50 ring-4 ring-tsPrimary/10'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <p className="font-bold text-gray-900">Ship to Address</p>
                        <p className="text-sm text-gray-500 mt-1">Delivered to your door</p>
                      </div>
                      <svg className={`w-6 h-6 ${deliveryMethod === 'shipping' ? 'text-tsPrimary' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </button>
                  )}

                  {cartSupportsPickup && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('pickup');
                      setShippingMethod(null);
                    }}
                    className={`p-5 border-2 rounded-xl transition-all ${
                      deliveryMethod === 'pickup'
                        ? 'border-tsPrimary bg-red-50 ring-4 ring-tsPrimary/10'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <p className="font-bold text-gray-900">Pickup</p>
                        <p className="text-sm text-gray-500 mt-1">Free — Pickup at store</p>
                      </div>
                      <svg className={`w-6 h-6 ${deliveryMethod === 'pickup' ? 'text-tsPrimary' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </button>
                  )}
                </div>
                {!cartSupportsShipping && cartSupportsPickup && (
                  <p className="mt-3 text-sm text-amber-700">
                    Your order will be picked up at the selected location.
                  </p>
                )}
                {cartSupportsShipping && !cartSupportsPickup && (
                  <p className="mt-3 text-sm text-amber-700">
                    Your cart contains shipping-only items. Pickup is unavailable.
                  </p>
                )}
                {!cartSupportsShipping && !cartSupportsPickup && (
                  <p className="mt-3 text-sm text-red-700">
                    Your cart items do not share a valid fulfillment method. Please review your cart.
                  </p>
                )}

                <AnimatePresence mode="wait">
                  {deliveryMethod === 'pickup' && cartSupportsPickup && (
                    <motion.div
                      key="pickup-info"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <label htmlFor="pickupLocation" className="block text-sm font-semibold text-blue-900 mb-2">
                          Pickup Location *
                        </label>
                        <select
                          id="pickupLocation"
                          value={pickupLocationId ?? ''}
                          onChange={(e) => {
                            const location = compatiblePickupLocations.find((item) => item.id === Number(e.target.value));
                            if (location) setSelectedLocation(location);
                          }}
                          className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-tsPrimary"
                        >
                          <option value="" disabled>Select a location</option>
                          {compatiblePickupLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                        {compatiblePickupLocations.length === 0 && (
                          <p className="text-sm text-red-700 mt-2">
                            No pickup location can fulfill all items in this cart. Remove incompatible items to continue.
                          </p>
                        )}
                        {pickupLocationId && (
                          <p className="text-sm text-blue-800 mt-3">
                            {(compatiblePickupLocations.find((location) => location.id === pickupLocationId)?.address) || appConfig?.store_info?.name}
                          </p>
                        )}
                        <p className="text-sm text-blue-700 mt-2">
                          You'll receive an email when your order is ready for pickup.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Shipping Address - Only show if shipping selected */}
              <AnimatePresence mode="wait">
              {deliveryMethod === 'shipping' && cartSupportsShipping && (
                <motion.div
                  key="shipping-form"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Shipping Address</h2>
                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="street1" className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 1 *
                    </label>
                    <input
                      type="text"
                      id="street1"
                      required
                      value={shippingAddress.street1}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, street1: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="street2" className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      id="street2"
                      value={shippingAddress.street2 || ''}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, street2: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="Apt, suite, etc. (optional)"
                    />
                  </div>
                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      id="city"
                      required
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      id="state"
                      required
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="CA"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code *
                    </label>
                    <input
                      type="text"
                      id="zip"
                      required
                      value={shippingAddress.zip}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, zip: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                      placeholder="12345"
                    />
                  </div>
                  <div>
                    <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                      Country *
                    </label>
                    <select
                      id="country"
                      required
                      value={shippingAddress.country}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                    >
                      <option value="US">United States</option>
                      <option value="GU">Guam</option>
                    </select>
                  </div>
                </div>

                {/* Calculate Shipping Button */}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleCalculateShipping}
                    disabled={calculatingShipping || !shippingAddress.street1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip}
                    className="w-full bg-tsPrimary text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                  >
                    {calculatingShipping ? 'Calculating...' : 'Calculate Shipping Rates'}
                  </button>

                  {shippingError && (
                    <p className="text-sm text-red-600 mt-2">{shippingError}</p>
                  )}
                </div>

                {/* Shipping Rates */}
                {availableShippingRates.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Shipping Method:</h3>
                    <div className="space-y-3">
                      {availableShippingRates.map((rate, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setShippingMethod(rate)}
                          className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                            shippingMethod?.carrier === rate.carrier && shippingMethod?.service === rate.service
                              ? 'border-tsPrimary bg-red-50 ring-4 ring-tsPrimary/10'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-gray-900">{rate.carrier} - {rate.service}</p>
                              {rate.delivery_days && (
                                <p className="text-sm text-gray-600 mt-1">
                                  Estimated delivery: {rate.delivery_days} business days
                                </p>
                              )}
                            </div>
                            <p className="text-lg font-bold text-gray-900">{formatPrice(rate.rate_cents)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </motion.div>
              )}
              </AnimatePresence>

              {/* Payment Section */}
              <PaymentForm
                ref={paymentForm}
                configuration={savedClientConfig || locationClientConfig}
                available={collectionAvailable(activeClientConfig)}
                onPaymentReady={handlePaymentReady}
              />

              {/* Order Notes */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Order Notes</h2>
                    <p className="text-sm text-gray-500">{deliveryMethod === 'pickup' ? 'Optional - meal preferences and pickup notes.' : 'Optional - delivery instructions and preferences.'}</p>
                  </div>
                </div>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder={deliveryMethod === 'pickup' ? 'e.g., Food allergies or pickup instructions.' : 'e.g., Delivery instructions or food allergies.'}
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition resize-none text-sm"
                />
                {orderNotes.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1 text-right">{orderNotes.length}/500</p>
                )}
              </div>

              {/* HAF-118: Validation Issues - Show cart sync problems before checkout */}
              {validationIssues && validationIssues.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start mb-3">
                    <svg className="w-5 h-5 text-amber-600 mr-2 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-800 mb-2">Cart Issues Found</h4>
                      <p className="text-sm text-amber-700 mb-3">
                        Please resolve these issues before proceeding with checkout:
                      </p>
                      <ul className="space-y-2">
                        {validationIssues.map((issue) => (
                          <li key={issue.cart_item_id} className="flex items-center justify-between text-sm">
                            <span className="text-amber-700">{issue.message}</span>
                            {issue.action === 'remove' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeItem(issue.cart_item_id);
                                  await fetchCart();
                                  // Remove this issue from the list
                                  setValidationIssues((prev) =>
                                    prev?.filter((i) => i.cart_item_id !== issue.cart_item_id) || null
                                  );
                                }}
                                className="ml-2 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-red-600 mr-2 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-red-700 whitespace-pre-line">{error}</div>
                  </div>
                </div>
              )}

              {pricePending && !pricingError && <p role="status" className="mb-3 text-sm text-warm-700">Updating your total for {deliveryMethod === 'pickup' ? storedLocation?.name || 'pickup' : 'shipping'}…</p>}
              {pricingError && <div role="alert" className="mb-3 text-sm text-red-700">{pricingError} <button type="button" className="underline min-h-11" onClick={() => void fetchCart({ fulfillment_type: deliveryMethod, location_id: deliveryMethod === 'pickup' ? pickupLocationId : null })}>Refresh price</button></div>}
              <label className="mb-4 flex items-start gap-3 text-sm text-warm-900"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>I have reviewed my items, {deliveryMethod === 'pickup' ? `pickup at ${storedLocation?.name || 'the selected location'}` : 'shipping address'}, and total of {formatPrice(totalCents)}.</span></label>
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isFormValid() || !!pendingPayment || !reviewed}
                className="w-full bg-tsPrimary text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  pendingPayment ? 'Payment status pending' : pricingError ? 'Refresh price to continue' : pricePending ? 'Updating price…' : `Pay ${formatPrice(totalCents)}`
                )}
              </button>
            </form>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 lg:sticky lg:top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>

              {/* Items */}
              <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id}>
                    <div className="flex items-center">
                      <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden border border-gray-200">
                        {item.product.primary_image_url ? (
                          <OptimizedImage
                            src={item.product.primary_image_url}
                            alt={item.product.name}
                            context="cart"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <PlaceholderImage variant="thumbnail" className="bg-gray-100" />
                        )}
                      </div>
                      <div className="ml-4 grow">
                        <p className="text-sm font-medium text-gray-900">{item.product.name}</p>
                        <p className="text-xs text-gray-500">{item.product_variant.display_name}</p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{formatPrice(item.subtotal_cents)}</p>
                    </div>
                    <div className="ml-20 mt-1">
                      {expandedInstructions[item.id] ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={specialInstructions[item.id] || ''}
                            onChange={(e) => setSpecialInstructions((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="e.g., no onions, extra sauce"
                            maxLength={200}
                            className="w-full px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedInstructions((prev) => ({ ...prev, [item.id]: false }));
                              setSpecialInstructions((prev) => {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              });
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 transition p-1"
                            aria-label="Remove special instructions"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedInstructions((prev) => ({ ...prev, [item.id]: true }))}
                          className="text-xs text-tsPrimary hover:text-tsPrimary/80 transition"
                        >
                          + Special instructions
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{formatPrice(subtotalCents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping'}
                  </span>
                  <span className="text-gray-900">
                    {deliveryMethod === 'pickup'
                      ? 'FREE'
                      : shippingMethod
                      ? formatPrice(shippingMethod.rate_cents)
                      : 'Calculate after entering address'
                    }
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="text-gray-900">$0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                  <span className="text-gray-900">Total</span>
                  <span className="text-tsPrimary">{formatPrice(totalCents)}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-4">
                {isSandbox
                  ? 'Sandbox payments: no real payment will be charged.'
                  : deliveryMethod === 'shipping' && !shippingMethod
                  ? 'Enter shipping address and calculate rates to see final total.'
                  : 'Final total shown above.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return <CheckoutForm />;
}
