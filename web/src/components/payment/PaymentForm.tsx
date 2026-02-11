import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';

interface PaymentFormProps {
  isTestMode: boolean;
  onPaymentReady: (ready: boolean) => void;
}

export default function PaymentForm({ isTestMode, onPaymentReady }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    setCardError(event.error ? event.error.message : null);
    setCardComplete(event.complete);
    onPaymentReady(event.complete && !event.error);
  };

  if (isTestMode) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-warm-100 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-warm-900">Payment</h2>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-yellow-800">Test Mode — No Payment Required</p>
              <p className="text-sm text-yellow-700 mt-1">
                Payment is simulated in test mode. Click "Place Order" to complete your test order.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stripe || !elements) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-warm-100 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-warm-900">Payment</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tsPrimary"></div>
          <span className="ml-3 text-warm-500">Loading payment form...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-warm-100 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-tsSurface rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-warm-900">Payment</h2>
          <p className="text-sm text-warm-500">Secured by Stripe</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <svg className="h-6" viewBox="0 0 32 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="21" rx="3" fill="#1A1F71"/>
            <path d="M13.5 14.5L15.2 6.5H17.3L15.6 14.5H13.5Z" fill="white"/>
            <path d="M22.1 6.7C21.7 6.5 21 6.3 20.2 6.3C18.1 6.3 16.6 7.4 16.6 9C16.6 10.2 17.7 10.8 18.5 11.2C19.3 11.6 19.6 11.8 19.6 12.2C19.6 12.8 18.9 13 18.2 13C17.3 13 16.8 12.9 16 12.5L15.7 12.4L15.4 14.1C16 14.4 17 14.6 18.1 14.6C20.3 14.6 21.8 13.5 21.8 11.8C21.8 10.9 21.2 10.2 19.9 9.6C19.2 9.2 18.8 9 18.8 8.5C18.8 8.1 19.3 7.7 20.2 7.7C20.9 7.7 21.5 7.8 21.8 8L22 8.1L22.1 6.7Z" fill="white"/>
            <path d="M24 6.5C23.6 6.5 23.2 6.6 23 7.1L20 14.5H22.2L22.6 13.3H25.3L25.5 14.5H27.5L25.7 6.5H24ZM23.2 11.6C23.4 11 24.2 8.9 24.2 8.9L24.8 11.6H23.2Z" fill="white"/>
            <path d="M12.4 6.5L10.3 11.8L10.1 10.8C9.7 9.5 8.4 8.1 7 7.4L8.9 14.5H11.1L14.6 6.5H12.4Z" fill="white"/>
            <path d="M8.8 6.5H5.5L5.5 6.7C8 7.3 9.7 8.8 10.1 10.8L9.6 7.1C9.5 6.6 9.2 6.5 8.8 6.5Z" fill="#F9A51A"/>
          </svg>
          <svg className="h-6" viewBox="0 0 32 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="21" rx="3" fill="#F0F0F0"/>
            <circle cx="12" cy="10.5" r="6.5" fill="#EB001B"/>
            <circle cx="20" cy="10.5" r="6.5" fill="#F79E1B"/>
            <path d="M16 5.3C17.5 6.5 18.5 8.4 18.5 10.5C18.5 12.6 17.5 14.5 16 15.7C14.5 14.5 13.5 12.6 13.5 10.5C13.5 8.4 14.5 6.5 16 5.3Z" fill="#FF5F00"/>
          </svg>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-2">
            Card Details *
          </label>
          <div className="bg-warm-50 border border-warm-200 rounded-lg p-4 focus-within:ring-2 focus-within:ring-tsPrimary focus-within:border-transparent focus-within:bg-white transition">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#1a1a1a',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    '::placeholder': {
                      color: '#9ca3af',
                    },
                  },
                  invalid: {
                    color: '#dc2626',
                    iconColor: '#dc2626',
                  },
                },
                hidePostalCode: true,
              }}
              onChange={handleCardChange}
            />
          </div>
          {cardError && (
            <p className="mt-2 text-sm text-red-600 flex items-center">
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {cardError}
            </p>
          )}
          {cardComplete && !cardError && (
            <p className="mt-2 text-sm text-green-600 flex items-center">
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Card details complete
            </p>
          )}
        </div>

        <div className="flex items-center text-xs text-warm-400 mt-3">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Your card information is encrypted and securely processed by Stripe. We never store your card details.
        </div>
      </div>
    </div>
  );
}
