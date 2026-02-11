import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { motion } from 'framer-motion';
import api, { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

interface OrderItem {
  id: number;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  product_sku: string;
}

interface Order {
  id: number;
  order_number: string;
  status: string;
  status_display?: string;
  payment_status: string;
  order_type: 'retail' | 'acai' | 'wholesale';
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subtotal_cents: number;
  shipping_cost_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_method: string;
  // Retail/Shipping fields
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country?: string;
  // Tracking fields
  tracking_number?: string;
  tracking_url?: string;
  can_track?: boolean;
  // Acai-specific fields
  acai_pickup_date?: string;
  acai_pickup_time?: string;
  acai_crust_type?: string;
  acai_include_placard?: boolean;
  acai_placard_text?: string;
  pickup_location?: string;
  pickup_phone?: string;
  // Common
  order_items: OrderItem[];
  created_at: string;
}

export default function OrderConfirmationPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken, isSignedIn } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        setError('Order ID is missing');
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams(location.search);
        const guestEmail = params.get('email');
        const token = isSignedIn ? await getToken() : null;
        const response = await api.get(`/orders/${orderId}`, {
          params: guestEmail ? { email: guestEmail } : undefined,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setOrder(response.data.order);
      } catch (err: unknown) {
        console.error('Failed to fetch order:', err);
        setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to load order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, [orderId, location.search, getToken, isSignedIn]);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPickupDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatPickupTime = (timeString: string) => {
    if (!timeString) return 'Time not specified';
    
    // Handle ISO datetime format (e.g., "2000-01-01T13:30:00.000Z")
    if (timeString.includes('T')) {
      try {
        const date = new Date(timeString);
        // Get the hours and minutes from the UTC time (since time-only is stored as UTC)
        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      } catch {
        return timeString;
      }
    }
    
    // Handle "HH:MM-HH:MM" format (slot range)
    if (timeString.includes('-') && timeString.includes(':')) {
      const parts = timeString.split('-');
      return parts.map(part => {
        const [hours, minutes] = part.trim().split(':');
        const hour = parseInt(hours);
        if (isNaN(hour)) return part;
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${hour12}:${minutes} ${period}`;
      }).join(' - ');
    }
    
    // Handle simple "HH:MM" format
    if (timeString.includes(':')) {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      if (isNaN(hour)) return timeString;
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${hour12}:${minutes} ${period}`;
    }
    
    return timeString;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-tsPrimary border-t-transparent mb-4"></div>
          <p className="text-gray-600">Loading your order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-4"><svg className="w-16 h-16 mx-auto text-warm-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'Unable to load order details'}</p>
          <button
            onClick={() => navigate('/products')}
            className="bg-tsPrimary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  const isAcaiOrder = order.order_type === 'acai';
  const isPickupOrder = order.shipping_method === 'pickup' || isAcaiOrder;

  const storePhone = appConfig?.store_info?.phone || '671-777-1234';
  const storePhoneTel = `tel:${storePhone.replace(/[^\d+]/g, '')}`;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:break-inside-avoid {
            break-inside: avoid !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:border {
            border: 1px solid #e5e7eb !important;
          }
          .print\\:p-4 {
            padding: 1rem !important;
          }
          .print\\:mb-4 {
            margin-bottom: 1rem !important;
          }
          .print\\:text-sm {
            font-size: 0.875rem !important;
          }
          @page {
            margin: 0.75in;
            size: letter;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 print:bg-white print:py-0">
        <div className="max-w-3xl mx-auto">
          {/* Success Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10 mb-6 text-center print:shadow-none print:border print:p-4 print:mb-4 print:break-inside-avoid relative overflow-hidden">
          {/* Decorative background */}
          <div className="absolute inset-0 bg-linear-to-br from-green-50 via-white to-green-50 opacity-50"></div>
          
          <div className="relative">
            {/* Animated Success icon */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
              className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <motion.svg
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
                className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </motion.svg>
            </motion.div>
            
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {isAcaiOrder ? 'Açaí Cake Order Confirmed!' : 'Order Confirmed!'}
            </h1>
            <p className="text-gray-600 mb-6">
              Thank you for your order, <span className="font-semibold">{order.customer_name}</span>!
            </p>
            
            <div className="bg-gray-100 border border-gray-200 rounded-xl p-5 inline-block">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Order Number</p>
              <p className="text-2xl font-bold font-mono text-gray-900">{order.order_number}</p>
            </div>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Confirmation sent to <span className="font-semibold">{order.customer_email}</span>
            </div>
          </div>
        </div>

        {/* Acai Pickup Details */}
        {isAcaiOrder && order.acai_pickup_date && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6 print:shadow-none print:border print:p-4 print:mb-4 print:break-inside-avoid">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100 flex items-center">
              <svg className="w-6 h-6 inline mr-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg> Pickup Details
            </h2>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-blue-600 font-medium mb-1">Pickup Date</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatPickupDate(order.acai_pickup_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-blue-600 font-medium mb-1">Pickup Time</p>
                  <p className="text-lg font-bold text-gray-900">
                    {order.acai_pickup_time && formatPickupTime(order.acai_pickup_time)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">Location</p>
                <p className="font-semibold text-gray-900">{order.pickup_location}</p>
              </div>
              
              {order.pickup_phone && (
                <div>
                  <p className="text-sm text-gray-600 font-medium mb-1">Phone</p>
                  <a href={`tel:${order.pickup_phone}`} className="font-semibold text-tsPrimary hover:underline">
                    {order.pickup_phone}
                  </a>
                </div>
              )}

              {order.acai_crust_type && (
                <div>
                  <p className="text-sm text-gray-600 font-medium mb-1">Base/Crust</p>
                  <p className="font-semibold text-gray-900">{order.acai_crust_type}</p>
                </div>
              )}

              {order.acai_include_placard && order.acai_placard_text && (
                <div>
                  <p className="text-sm text-gray-600 font-medium mb-1">Message Placard</p>
                  <p className="font-semibold text-gray-900 italic">"{order.acai_placard_text}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6 print:shadow-none print:border print:p-4 print:mb-4 print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100 flex items-center">
            <svg className="w-6 h-6 text-tsPrimary mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Order Details
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Order Date</p>
              <p className="font-semibold">{formatDate(order.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Payment Status</p>
              <p className="font-semibold capitalize">
                {order.payment_status === 'paid' ? (
                  <span className="text-green-600">✓ Paid</span>
                ) : (
                  order.payment_status
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Order Status</p>
              <p className="font-semibold capitalize">{order.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">
                {isPickupOrder ? 'Fulfillment' : 'Shipping Method'}
              </p>
              <p className="font-semibold">
                {isPickupOrder ? 'Pickup' : order.shipping_method}
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Items Ordered</h3>
            <div className="border rounded-lg overflow-hidden">
              {order.order_items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-4 border-b last:border-b-0 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{item.product_name}</p>
                    {item.variant_name && (
                      <p className="text-sm text-gray-600">{item.variant_name}</p>
                    )}
                    <p className="text-sm text-gray-500">SKU: {item.product_sku}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                    <p className="font-semibold text-gray-900">{formatPrice(item.total_price_cents)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold">{formatPrice(order.subtotal_cents)}</span>
            </div>
            {!isPickupOrder && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-semibold">{formatPrice(order.shipping_cost_cents)}</span>
              </div>
            )}
            {order.tax_cents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="font-semibold">{formatPrice(order.tax_cents)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total</span>
              <span className="text-tsPrimary">{formatPrice(order.total_cents)}</span>
            </div>
          </div>
        </div>

        {/* Order Tracking - For shipped retail orders */}
        {order.order_type === 'retail' && (order.status === 'shipped' || order.can_track) && (
          <div id="tracking" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6 print:shadow-none print:border print:p-4 print:mb-4 print:break-inside-avoid">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100 flex items-center">
              <svg className="w-6 h-6 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Order Tracking
            </h2>
            
            {/* Order Status Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                {['pending', 'processing', 'shipped', 'delivered'].map((step, idx) => {
                  const stepIndex = ['pending', 'processing', 'shipped', 'delivered'].indexOf(order.status);
                  const isComplete = idx <= stepIndex;
                  const isCurrent = step === order.status;
                  
                  return (
                    <div key={step} className="flex flex-col items-center flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                        isComplete 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      } ${isCurrent ? 'ring-2 ring-green-300' : ''}`}>
                        {isComplete ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="text-xs">{idx + 1}</span>
                        )}
                      </div>
                      <span className={`text-xs text-center ${isCurrent ? 'font-bold text-green-600' : 'text-gray-500'}`}>
                        {step.charAt(0).toUpperCase() + step.slice(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Animated Progress bar */}
              <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                <motion.div
                  className="h-1.5 bg-green-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${((['pending', 'processing', 'shipped', 'delivered'].indexOf(order.status) + 1) / 4) * 100}%` 
                  }}
                  transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            {/* Tracking Number */}
            {order.tracking_number ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-purple-600 font-medium mb-1">Tracking Number</p>
                    <p className="text-lg font-mono font-bold text-gray-900">{order.tracking_number}</p>
                    {order.shipping_method && (
                      <p className="text-sm text-gray-600 mt-1">via {order.shipping_method}</p>
                    )}
                  </div>
                  {order.tracking_url && (
                    <a
                      href={order.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Track Package
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-gray-600">
                  {order.status === 'pending' && 'Your order is being prepared. Tracking will be available once shipped.'}
                  {order.status === 'processing' && 'Your order is being processed. Tracking information coming soon.'}
                  {order.status === 'shipped' && 'Shipped! Tracking info will be updated shortly.'}
                  {order.status === 'delivered' && 'Your order has been delivered!'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Shipping Address - Only for non-pickup orders */}
        {!isPickupOrder && order.shipping_address_line1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6 print:shadow-none print:border print:p-4 print:mb-4 print:break-inside-avoid">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">Shipping Address</h2>
            <div className="text-gray-700">
              <p className="font-semibold">{order.customer_name}</p>
              <p>{order.shipping_address_line1}</p>
              {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
              <p>
                {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
              </p>
              <p>{order.shipping_country}</p>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>Phone: {order.customer_phone}</p>
              <p>Email: {order.customer_email}</p>
            </div>
          </div>
        )}

        {/* Actions - Hidden when printing */}
        <div className="flex flex-col sm:flex-row gap-4 print:hidden">
          <button
            onClick={() => navigate(isAcaiOrder ? '/acai-cakes' : '/products')}
            className="flex-1 btn-primary py-4 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {isAcaiOrder ? 'Order Another Cake' : 'Continue Shopping'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 btn-secondary py-4 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Order
          </button>
        </div>

        {/* Help Text - Hidden when printing */}
        <div className="mt-8 text-center print:hidden">
          <div className="bg-tsSurface rounded-xl p-6">
            <p className="text-gray-700 mb-2 font-medium">
              Questions about your order?
            </p>
            <a 
              href={storePhoneTel}
              className="inline-flex items-center gap-2 text-tsPrimary font-bold hover:underline"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {storePhone}
            </a>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
