import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { CheckCircle, Package, MapPin, Truck, Mail, Phone, Heart } from 'lucide-react';
import api from '../../services/api';

interface OrderItem {
  id: number;
  product_name: string;
  variant_name: string;
  quantity: number;
  price_cents: number;
}

interface FundraiserOrder {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  total_cents: number;
  subtotal_cents: number;
  shipping_cents: number;
  items: OrderItem[];
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  // Legacy aliases
  email?: string;
  phone?: string;
  delivery_method: 'pickup' | 'shipping';
  shipping_address?: {
    name?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  pickup_location?: string;
  pickup_instructions?: string;
  participant_name?: string;
  fundraiser_name: string;
  created_at: string;
}

export default function FundraiserOrderConfirmationPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const location = useLocation();

  const [order, setOrder] = useState<FundraiserOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug && orderId) {
      loadOrder();
    }
  }, [slug, orderId, location.search]);

  const loadOrder = async () => {
    try {
      const params = new URLSearchParams(location.search);
      const guestEmail = params.get('email');
      const response = await api.get(`/fundraisers/${slug}/orders/${orderId}`, {
        params: guestEmail ? { email: guestEmail } : undefined,
      });
      setOrder(response.data.order);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Order not found');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-warm-900 mb-2">Order Not Found</h1>
        <p className="text-warm-600 mb-4">{error}</p>
        <Link to={`/f/${slug}`} className="text-tsPrimary hover:underline">
          Back to Fundraiser
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Success Header */}
      <div className="bg-green-50 border-b border-green-200">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-warm-900 mb-2">Thank You!</h1>
          <p className="text-warm-600">
            Your order has been placed successfully.
          </p>
          <p className="text-lg font-medium text-warm-800 mt-2">
            Order #{order.order_number}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Supporting Participant */}
        {order.participant_name && (
          <div className="bg-tsGold/10 border border-tsGold rounded-lg p-4 flex items-center gap-3">
            <Heart className="w-5 h-5 text-tsPrimary fill-tsPrimary" />
            <p className="text-warm-800">
              You supported <span className="font-semibold">{order.participant_name}</span> with
              this order!
            </p>
          </div>
        )}

        {/* Order Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Order Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-600">Fundraiser</span>
              <span className="font-medium">{order.fundraiser_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-600">Order Date</span>
              <span className="font-medium">{formatDate(order.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-600">Status</span>
              <span className="inline-flex px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                {order.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-600">Payment</span>
              <span className="inline-flex px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                {order.payment_status}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
          <div className="space-y-2">
            <p className="font-medium">{order.customer_name}</p>
            <p className="flex items-center gap-2 text-warm-600">
              <Mail className="w-4 h-4" />
              {order.customer_email || order.email}
            </p>
            <p className="flex items-center gap-2 text-warm-600">
              <Phone className="w-4 h-4" />
              {order.customer_phone || order.phone}
            </p>
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            {order.delivery_method === 'pickup' ? 'Pickup Information' : 'Shipping Address'}
          </h2>
          {order.delivery_method === 'pickup' ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-warm-700">
                <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
                <span>{order.pickup_location}</span>
              </div>
              {order.pickup_instructions && (
                <p className="text-sm text-warm-600 pl-7">{order.pickup_instructions}</p>
              )}
            </div>
          ) : order.shipping_address ? (
            <div className="flex items-start gap-2 text-warm-700">
              <Truck className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                {order.shipping_address.name && <p>{order.shipping_address.name}</p>}
                <p>{order.shipping_address.street1}</p>
                {order.shipping_address.street2 && <p>{order.shipping_address.street2}</p>}
                <p>
                  {order.shipping_address.city}, {order.shipping_address.state}{' '}
                  {order.shipping_address.zip}
                </p>
                <p>{order.shipping_address.country}</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Items Ordered</h2>
          <div className="divide-y divide-warm-100">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-3">
                <div className="w-12 h-12 bg-warm-100 rounded flex items-center justify-center">
                  <Package className="w-6 h-6 text-warm-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product_name}</p>
                  <p className="text-sm text-warm-500">{item.variant_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatPrice(item.price_cents * item.quantity)}</p>
                  <p className="text-sm text-warm-500">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-warm-200 mt-4 pt-4 space-y-2">
            <div className="flex justify-between text-warm-600">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-warm-600">
              <span>Shipping</span>
              <span>{order.shipping_cents > 0 ? formatPrice(order.shipping_cents) : 'Free'}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-warm-200">
              <span>Total</span>
              <span className="text-tsPrimary">{formatPrice(order.total_cents)}</span>
            </div>
          </div>
        </div>

        {/* Back to Fundraiser */}
        <div className="text-center">
          <Link
            to={`/f/${slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium"
          >
            Back to Fundraiser
          </Link>
        </div>
      </div>
    </div>
  );
}
