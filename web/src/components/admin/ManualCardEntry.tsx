import { useState } from 'react';
import {
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CreditCard, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ManualCardEntryProps {
  clientSecret: string;
  totalCents: number;
  orderId: number;
  onSuccess: (result: ManualPaymentResult) => void;
  onClose: () => void;
  apiToken: string;
}

export interface ManualPaymentResult {
  orderId: number;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '18px',
      color: '#1e293b',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': { color: '#94a3b8' },
      lineHeight: '28px',
    },
    invalid: {
      color: '#dc2626',
      iconColor: '#dc2626',
    },
  },
  hidePostalCode: true,
};

export default function ManualCardEntry({
  clientSecret,
  totalCents,
  orderId,
  onSuccess,
  onClose,
  apiToken,
}: ManualCardEntryProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const totalFormatted = `$${(totalCents / 100).toFixed(2)}`;

  const handleSubmit = async () => {
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found');
      setProcessing(false);
      return;
    }

    // Confirm the payment with Stripe.js
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card: cardElement } }
    );

    if (stripeError) {
      setError(stripeError.message || 'Payment failed');
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Confirm with our backend
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(
          `${apiUrl}/api/v1/admin/pos/orders/${orderId}/confirm_manual_payment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiToken}`,
            },
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to confirm payment');
        }

        const data = await res.json();
        setSucceeded(true);

        setTimeout(() => {
          onSuccess({
            orderId,
            brand: data.card_details?.brand,
            last4: data.card_details?.last4,
            expMonth: data.card_details?.exp_month,
            expYear: data.card_details?.exp_year,
          });
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to confirm payment');
        setProcessing(false);
      }
    } else {
      setError(`Unexpected payment status: ${paymentIntent?.status}`);
      setProcessing(false);
    }
  };

  if (succeeded) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h3>
          <p className="text-gray-500">{totalFormatted} charged</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            <h3 className="text-lg font-semibold">Manual Card Entry</h3>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-2 text-sm text-gray-500">
          Reader unavailable? Enter card details manually.
        </div>
        <div className="mb-4 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Note: Manual entry rate is 2.9% + 30¢ (vs 2.6% + 10¢ for tap/insert)
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Card Details
          </label>
          <div className="border-2 border-gray-200 rounded-xl p-4 focus-within:border-indigo-500 transition-colors">
            <CardElement options={CARD_ELEMENT_OPTIONS} />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-500">Total</span>
          <span className="text-2xl font-bold text-gray-900">{totalFormatted}</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!stripe || processing}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Charge {totalFormatted}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
