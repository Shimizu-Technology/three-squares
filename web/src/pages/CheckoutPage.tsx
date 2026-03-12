import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useCartStore } from '../store/cartStore';
import { configApi, locationsApi, ordersApi, shippingApi, paymentIntentsApi, formatPrice } from '../services/api';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { motion, AnimatePresence } from 'framer-motion';
import StripeProvider from '../components/payment/StripeProvider';
import PaymentForm from '../components/payment/PaymentForm';
import type { ShippingAddress, ShippingMethod, AppConfig } from '../types/order';
import type { Location } from '../services/api';
import PlaceholderImage from '../components/ui/PlaceholderImage';
import OptimizedImage from '../components/ui/OptimizedImage';
import { useLocationStore } from '../store/locationStore';

function CheckoutForm() {
  const navigate = useNavigate();
  const { getToken, isSignedIn, isLoaded: authLoaded } = useAuth();
  const { cart, clearCart, sessionId, fetchCart, validateCart, removeItem, isLoading: cartLoading } = useCartStore();
  const { selectedLocation: storedLocation } = useLocationStore();
  const stripe = useStripe();
  const elements = useElements();
  
  // Get items from cart (with fallback to empty array)
  const items = cart?.items || [];
  const subtotalCents = cart?.subtotal_cents || 0; // Use cents directly from cart
  const cartSupportsShipping = items.length > 0 && items.every((item) => item.product.allow_shipping === true);
  const cartSupportsPickup = items.length > 0 && items.every((item) => item.product.allow_pickup === true);
  
  // App config
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('shipping');
  const [pickupLocations, setPickupLocations] = useState<Location[]>([]);
  const [pickupLocationId, setPickupLocationId] = useState<number | null>(null);
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
  
  const isTestMode = appConfig?.app_mode === 'test';

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

  // Load app config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await configApi.getConfig();
        setAppConfig(config);
        const locations = await locationsApi.getLocations();
        const locs = locations.locations || [];
        setPickupLocations(locs);
        // Pre-fill from location store, fall back to first location
        if (storedLocation && locs.some((l: Location) => l.id === storedLocation.id)) {
          setPickupLocationId(storedLocation.id);
        } else if (locs.length > 0) {
          setPickupLocationId(locs[0].id);
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setConfigLoading(false);
      }
    };
    loadConfig();
  }, []);
  
  // Fetch cart on mount
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);
  
  // Redirect if cart is empty (but wait for cart to load first!)
  useEffect(() => {
    // Only redirect if cart has loaded AND is empty
    if (!cartLoading && cart !== null && items.length === 0 && !configLoading) {
      navigate('/products');
    }
  }, [cartLoading, cart, items.length, navigate, configLoading]);

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
    if (compatiblePickupLocations.length === 0) {
      setPickupLocationId(null);
      return;
    }

    const hasValidCurrentLocation =
      pickupLocationId !== null && compatiblePickupLocationIds.includes(pickupLocationId);
    if (!hasValidCurrentLocation) {
      setPickupLocationId(compatiblePickupLocations[0].id);
    }
  }, [deliveryMethod, pickupLocationId, compatiblePickupLocationIds, compatiblePickupLocations]);
  
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
    const hasContactInfo = name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';
    
    if (deliveryMethod === 'pickup') {
      if (!cartSupportsPickup) return false;
      if (compatiblePickupLocations.length === 0) return false;
      return hasContactInfo && pickupLocationId !== null && (isTestMode || paymentReady);
    }
    
    if (!cartSupportsShipping) return false;

    // For shipping, need address and shipping method selected
    const hasAddress = 
      shippingAddress.street1.trim() !== '' &&
      shippingAddress.city.trim() !== '' &&
      shippingAddress.state.trim() !== '' &&
      shippingAddress.zip.trim() !== '';
    
    return hasContactInfo && hasAddress && shippingMethod !== null && (isTestMode || paymentReady);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const shippingCostCents = deliveryMethod === 'pickup' ? 0 : (shippingMethod?.rate_cents || 0);
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

      if (isTestMode) {
        // Test mode: skip Stripe, create order directly
        const orderData = {
          customer_name: name,
          email, phone,
          fulfillment_type: deliveryMethod,
          location_id: deliveryMethod === 'pickup' ? pickupLocationId || undefined : undefined,
          shipping_address: orderShippingAddress,
          shipping_method: orderShippingMethod,
          payment_method: { type: 'test' },
          notes: orderNotes.trim() || undefined,
          item_special_instructions: Object.keys(itemInstructions).length > 0 ? itemInstructions : undefined,
        };
        const response = await ordersApi.createOrder(orderData, token, sessionId);
        if (response.success) {
          await clearCart();
          navigate(`/orders/${response.order.id}?email=${encodeURIComponent(email)}`);
        } else {
          setError('Failed to create order. Please try again.');
        }
      } else {
        // Real Stripe payment flow
        if (!stripe || !elements) {
          setError('Payment system is not ready. Please wait and try again.');
          setLoading(false);
          return;
        }
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError('Card input not found. Please refresh and try again.');
          setLoading(false);
          return;
        }
        // Step 1: Create PaymentIntent
        const intentResponse = await paymentIntentsApi.create(
          {
            email,
            shipping_cost_cents: shippingCostCents,
            fulfillment_type: deliveryMethod,
            location_id: deliveryMethod === 'pickup' ? pickupLocationId || undefined : undefined,
          },
          token,
          sessionId
        );
        // Step 2: Confirm card payment with Stripe
        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
          intentResponse.client_secret,
          { payment_method: { card: cardElement, billing_details: { name, email, phone } } }
        );
        if (stripeError) {
          setError(stripeError.message || 'Payment failed. Please check your card details.');
          setLoading(false);
          return;
        }
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
          setError('Payment was not completed. Please try again.');
          setLoading(false);
          return;
        }
        // Step 3: Create order with payment intent ID
        const orderData = {
          customer_name: name,
          email, phone,
          fulfillment_type: deliveryMethod,
          location_id: deliveryMethod === 'pickup' ? pickupLocationId || undefined : undefined,
          shipping_address: orderShippingAddress,
          shipping_method: orderShippingMethod,
          payment_method: { type: 'stripe' },
          payment_intent_id: paymentIntent.id,
          notes: orderNotes.trim() || undefined,
          item_special_instructions: Object.keys(itemInstructions).length > 0 ? itemInstructions : undefined,
        };
        const response = await ordersApi.createOrder(orderData, token, sessionId);
        if (response.success) {
          await clearCart();
          navigate(`/orders/${response.order.id}?email=${encodeURIComponent(email)}`);
        } else {
          setError('Your payment was processed but there was an issue creating your order. Please contact support with reference: ' + paymentIntent.id);
        }
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      const axiosErr = err as { response?: { data?: { error?: string; issues?: Array<{ message: string }> } } };
      if (axiosErr.response?.data?.issues && axiosErr.response.data.issues.length > 0) {
        const issues = axiosErr.response.data.issues;
        const errorMessages = issues.map((issue) => `• ${issue.message}`).join('\n');
        setError(`Unable to complete order:\n${errorMessages}`);
      } else {
        setError(axiosErr.response?.data?.error || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate total
  const shippingCostCents = deliveryMethod === 'pickup' ? 0 : (shippingMethod?.rate_cents || 0);
  const totalCents = subtotalCents + shippingCostCents;
  
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
        {isTestMode && (
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-yellow-600 mr-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="font-semibold text-yellow-800 mb-1">Test Mode Active</h3>
                <p className="text-sm text-yellow-700">
                  This is a test environment. No real payments will be processed. 
                  Orders will be created for testing purposes only.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2">
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
                      onChange={(e) => setName(e.target.value)}
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
                      onChange={(e) => setEmail(e.target.value)}
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
                      onChange={(e) => setPhone(e.target.value)}
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
                  <h2 className="text-xl font-bold text-gray-900">Delivery Method</h2>
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
                    Your cart contains pickup-only items. Shipping is unavailable.
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
                          onChange={(e) => setPickupLocationId(e.target.value ? Number(e.target.value) : null)}
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
                isTestMode={isTestMode}
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
                    <p className="text-sm text-gray-500">Optional - delivery instructions, allergies, etc.</p>
                  </div>
                </div>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="e.g., Please deliver to the side door, food allergies, etc."
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
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isFormValid()}
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
                  isTestMode ? `Place Test Order - ${formatPrice(totalCents)}` : `Pay ${formatPrice(totalCents)}`
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
                        <input
                          type="text"
                          value={specialInstructions[item.id] || ''}
                          onChange={(e) => setSpecialInstructions((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="e.g., no onions, extra sauce"
                          maxLength={200}
                          className="w-full px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedInstructions((prev) => ({ ...prev, [item.id]: true }))}
                          className="text-xs text-tsPrimary hover:text-primary-dark transition"
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
                {isTestMode 
                  ? 'Test mode: No real payment will be charged.'
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

/**
 * CheckoutPage wraps CheckoutForm in StripeProvider
 * so Stripe hooks are available throughout the form.
 */
export default function CheckoutPage() {
  return (
    <StripeProvider>
      <CheckoutForm />
    </StripeProvider>
  );
}
