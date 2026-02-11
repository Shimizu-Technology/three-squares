import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, Truck, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import fundraiserPublicService, {
  type Fundraiser,
  type ShippingRate,
} from '../../services/fundraiserPublicService';
import { configApi, formatPrice } from '../../services/api';
import type { AppConfig } from '../../types/order';
import { FundraiserCartProvider, useFundraiserCart } from '../../contexts/FundraiserCartContext';
import FundraiserSupportingBanner from '../../components/fundraiser/FundraiserSupportingBanner';
import StripeProvider from '../../components/payment/StripeProvider';
import PaymentForm from '../../components/payment/PaymentForm';

function FundraiserCheckoutForm() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // App config
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('pickup');

  // Shipping state
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedShippingRate, setSelectedShippingRate] = useState<ShippingRate | null>(null);
  const [calculatingShipping, setCalculatingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // Payment state
  const [paymentReady, setPaymentReady] = useState(false);

  const { state, setFundraiser: setCartFundraiser, clearCart, subtotal } = useFundraiserCart();

  const isTestMode = appConfig?.app_mode === 'test';

  useEffect(() => {
    if (slug) {
      loadData();
    }
  }, [slug]);

  useEffect(() => {
    // Load app config
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  // Redirect if cart is empty
  useEffect(() => {
    if (!loading && state.items.length === 0) {
      navigate(`/f/${slug}`);
    }
  }, [loading, state.items.length, navigate, slug]);

  // Set default delivery method based on fundraiser settings
  useEffect(() => {
    if (fundraiser) {
      if (!fundraiser.allow_shipping && fundraiser.pickup_location) {
        setDeliveryMethod('pickup');
      } else if (fundraiser.allow_shipping && !fundraiser.pickup_location) {
        setDeliveryMethod('shipping');
      }
    }
  }, [fundraiser]);

  const loadData = async () => {
    try {
      const response = await fundraiserPublicService.getFundraiser(slug!);
      setFundraiser(response.fundraiser);
      setCartFundraiser(response.fundraiser.slug, response.fundraiser.id);
    } catch (err) {
      console.error('Failed to load fundraiser:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateShipping = async () => {
    if (
      !shippingAddress.street1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zip
    ) {
      setShippingError('Please fill out all required shipping address fields');
      return;
    }

    setCalculatingShipping(true);
    setShippingError(null);

    try {
      const items = state.items.map((item) => ({
        fundraiser_product_id: item.fundraiserProductId,
        variant_id: item.variantId,
        quantity: item.quantity,
      }));

      const response = await fundraiserPublicService.calculateShipping(slug!, items, {
        ...shippingAddress,
        name: shippingAddress.name || name,
      });

      setShippingRates(response.rates);
      if (response.rates.length > 0) {
        setSelectedShippingRate(response.rates[0]);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setShippingError(
        error.response?.data?.error || 'Failed to calculate shipping. Please try again.'
      );
    } finally {
      setCalculatingShipping(false);
    }
  };

  const handlePaymentReady = useCallback((ready: boolean) => {
    setPaymentReady(ready);
  }, []);

  const isFormValid = () => {
    const hasContactInfo = name.trim() && email.trim() && phone.trim();

    if (deliveryMethod === 'pickup') {
      return hasContactInfo && (isTestMode || paymentReady);
    }

    const hasAddress =
      shippingAddress.street1.trim() &&
      shippingAddress.city.trim() &&
      shippingAddress.state.trim() &&
      shippingAddress.zip.trim();

    return hasContactInfo && hasAddress && selectedShippingRate && (isTestMode || paymentReady);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const items = state.items.map((item) => ({
        fundraiser_product_id: item.fundraiserProductId,
        variant_id: item.variantId,
        quantity: item.quantity,
      }));

      const shippingCostCents =
        deliveryMethod === 'shipping' ? selectedShippingRate?.rate_cents || 0 : 0;
      const totalCents = subtotal + shippingCostCents;

      let paymentIntentId: string | undefined;

      if (!isTestMode) {
        // Create payment intent
        const paymentIntent = await fundraiserPublicService.createPaymentIntent(slug!, {
          email,
          amount_cents: totalCents,
          items,
        });

        // Confirm payment with Stripe
        if (!stripe || !elements) {
          throw new Error('Stripe not loaded');
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          throw new Error('Card element not found');
        }

        const { error: stripeError, paymentIntent: confirmedPayment } =
          await stripe.confirmCardPayment(paymentIntent.client_secret, {
            payment_method: {
              card: cardElement,
              billing_details: {
                name,
                email,
                phone,
              },
            },
          });

        if (stripeError) {
          throw new Error(stripeError.message);
        }

        paymentIntentId = confirmedPayment?.id;
      }

      // Create the order
      const orderData = {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        participant_code: state.participantCode || undefined,
        delivery_method: deliveryMethod,
        items,
        payment_intent_id: paymentIntentId,
        ...(deliveryMethod === 'shipping' && {
          shipping_address: {
            ...shippingAddress,
            name: shippingAddress.name || name,
          },
          shipping_method: selectedShippingRate
            ? {
                carrier: selectedShippingRate.carrier,
                service: selectedShippingRate.service,
                rate_cents: selectedShippingRate.rate_cents,
                rate_id: selectedShippingRate.rate_id,
              }
            : undefined,
        }),
      };

      const response = await fundraiserPublicService.createOrder(slug!, orderData);

      if (response.success) {
        clearCart();
        navigate(`/f/${slug}/order/${response.order.id}?email=${encodeURIComponent(email)}`);
      } else {
        throw new Error('Order creation failed');
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err);
      const error = err as Error & { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || error.message || 'Failed to process order');
      toast.error('Failed to process order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const shippingCostCents =
    deliveryMethod === 'shipping' ? selectedShippingRate?.rate_cents || 0 : 0;
  const totalCents = subtotal + shippingCostCents;

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <div className="bg-white border-b border-warm-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/f/${slug}/cart`}
              className="p-2 hover:bg-warm-100 rounded-lg transition"
              aria-label="Back to cart"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-warm-900">Checkout</h1>
              {fundraiser && <p className="text-sm text-warm-600">{fundraiser.name}</p>}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-8">
        {/* Supporting Banner */}
        {state.participantName && (
          <div className="mb-6">
            <FundraiserSupportingBanner participantName={state.participantName} />
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Phone *
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="(671) 555-1234"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Method */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Delivery Method</h2>
              <div className="space-y-3">
                {fundraiser?.pickup_location && (
                  <label
                    className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition ${
                      deliveryMethod === 'pickup'
                        ? 'border-tsPrimary bg-tsPrimary/5'
                        : 'border-warm-200 hover:border-warm-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      value="pickup"
                      checked={deliveryMethod === 'pickup'}
                      onChange={() => setDeliveryMethod('pickup')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-warm-600" />
                        <span className="font-medium">Pickup</span>
                        <span className="text-green-600 text-sm font-medium">Free</span>
                      </div>
                      <p className="text-sm text-warm-600 mt-1">
                        {fundraiser.pickup_location}
                      </p>
                      {fundraiser.pickup_instructions && (
                        <p className="text-sm text-warm-500 mt-1">
                          {fundraiser.pickup_instructions}
                        </p>
                      )}
                    </div>
                  </label>
                )}

                {fundraiser?.allow_shipping && (
                  <label
                    className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition ${
                      deliveryMethod === 'shipping'
                        ? 'border-tsPrimary bg-tsPrimary/5'
                        : 'border-warm-200 hover:border-warm-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      value="shipping"
                      checked={deliveryMethod === 'shipping'}
                      onChange={() => setDeliveryMethod('shipping')}
                      className="mt-1"
                    />
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-warm-600" />
                      <span className="font-medium">Ship to Address</span>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Shipping Address */}
            {deliveryMethod === 'shipping' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      value={shippingAddress.street1}
                      onChange={(e) =>
                        setShippingAddress({ ...shippingAddress, street1: e.target.value })
                      }
                      required={deliveryMethod === 'shipping'}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="123 Main St"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Apt, Suite, etc. (optional)
                    </label>
                    <input
                      type="text"
                      value={shippingAddress.street2}
                      onChange={(e) =>
                        setShippingAddress({ ...shippingAddress, street2: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="Apt 4B"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-sm font-medium text-warm-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={shippingAddress.city}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, city: e.target.value })
                        }
                        required={deliveryMethod === 'shipping'}
                        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                        placeholder="Hagåtña"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-700 mb-1">
                        State *
                      </label>
                      <input
                        type="text"
                        value={shippingAddress.state}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, state: e.target.value })
                        }
                        required={deliveryMethod === 'shipping'}
                        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                        placeholder="GU"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-700 mb-1">
                        ZIP *
                      </label>
                      <input
                        type="text"
                        value={shippingAddress.zip}
                        onChange={(e) =>
                          setShippingAddress({ ...shippingAddress, zip: e.target.value })
                        }
                        required={deliveryMethod === 'shipping'}
                        className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                        placeholder="96910"
                      />
                    </div>
                  </div>

                  {/* Calculate Shipping Button */}
                  <button
                    type="button"
                    onClick={handleCalculateShipping}
                    disabled={calculatingShipping}
                    className="w-full py-2 border border-tsPrimary text-tsPrimary rounded-lg hover:bg-tsPrimary/5 disabled:opacity-50 transition font-medium"
                  >
                    {calculatingShipping ? 'Calculating...' : 'Calculate Shipping'}
                  </button>

                  {shippingError && (
                    <p className="text-red-600 text-sm">{shippingError}</p>
                  )}

                  {/* Shipping Rate Options */}
                  {shippingRates.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-warm-700">
                        Select Shipping Method
                      </label>
                      {shippingRates.map((rate, idx) => (
                        <label
                          key={idx}
                          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition ${
                            selectedShippingRate === rate
                              ? 'border-tsPrimary bg-tsPrimary/5'
                              : 'border-warm-200 hover:border-warm-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="shipping_rate"
                              checked={selectedShippingRate === rate}
                              onChange={() => setSelectedShippingRate(rate)}
                            />
                            <div>
                              <span className="font-medium">
                                {rate.carrier} {rate.service}
                              </span>
                              {rate.delivery_days && (
                                <span className="text-sm text-warm-500 ml-2">
                                  ({rate.delivery_days} days)
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-medium">{formatPrice(rate.rate_cents)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment */}
            <div className="bg-white rounded-lg shadow p-6">
              <PaymentForm isTestMode={isTestMode} onPaymentReady={handlePaymentReady} />
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

              {/* Items */}
              <div className="space-y-3 mb-4">
                {state.items.map((item) => (
                  <div
                    key={`${item.fundraiserProductId}-${item.variantId}`}
                    className="flex gap-3"
                  >
                    <div className="w-12 h-12 bg-warm-100 rounded overflow-hidden shrink-0">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-warm-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-warm-500">{item.variantName}</p>
                      <p className="text-xs text-warm-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatPrice(item.priceCents * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-warm-200 pt-4 space-y-2">
                <div className="flex justify-between text-warm-700">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-warm-700">
                  <span>Shipping</span>
                  <span>
                    {deliveryMethod === 'pickup'
                      ? 'Free'
                      : selectedShippingRate
                      ? formatPrice(selectedShippingRate.rate_cents)
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-warm-200">
                  <span>Total</span>
                  <span className="text-tsPrimary">{formatPrice(totalCents)}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid() || submitting}
                className="w-full mt-6 py-3 bg-tsPrimary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:bg-warm-300 disabled:cursor-not-allowed transition"
              >
                {submitting ? 'Processing...' : `Pay ${formatPrice(totalCents)}`}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function FundraiserCheckoutPageContent() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  if (!appConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Wrap with StripeProvider
  return (
    <StripeProvider>
      <FundraiserCheckoutForm />
    </StripeProvider>
  );
}

// Wrapper with provider
export default function FundraiserCheckoutPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <FundraiserCartProvider fundraiserSlug={slug}>
      <FundraiserCheckoutPageContent />
    </FundraiserCartProvider>
  );
}
