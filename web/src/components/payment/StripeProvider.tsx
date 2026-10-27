import { useMemo, type ReactNode } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import useAppConfig from '../../hooks/useAppConfig';

const envStripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

interface StripeProviderProps {
  children: ReactNode;
  clientSecret?: string;
}

export default function StripeProvider({ children, clientSecret }: StripeProviderProps) {
  const config = useAppConfig();
  const stripePublishableKey = config?.stripe_publishable_key || envStripePublishableKey;

  const stripePromise = useMemo(() => {
    if (!stripePublishableKey) {
      console.warn('Missing Stripe publishable key — embedded card checkout will not be available');
      return null;
    }
    return loadStripe(stripePublishableKey);
  }, [stripePublishableKey]);

  const options: StripeElementsOptions = useMemo(() => {
    if (clientSecret) {
      return {
        clientSecret,
        appearance: {
          theme: 'stripe' as const,
          variables: {
            colorPrimary: '#C62828',
            colorBackground: '#ffffff',
            colorText: '#1a1a1a',
            colorDanger: '#dc2626',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: '8px',
            spacingUnit: '4px',
          },
          rules: {
            '.Input': {
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
              padding: '12px 16px',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            },
            '.Input:focus': {
              border: '2px solid #C62828',
              boxShadow: '0 0 0 1px rgba(198, 40, 40, 0.1)',
            },
            '.Label': {
              fontWeight: '600',
              fontSize: '14px',
              marginBottom: '6px',
            },
          },
        },
      };
    }
    return {};
  }, [clientSecret]);

  // Always render children inside Elements — even with stripe={null}.
  // In test mode the PaymentForm shows a test banner and useStripe()/useElements()
  // safely return null, so the checkout works without a real Stripe key.
  return (
    <Elements stripe={stripePromise} options={clientSecret ? options : undefined}>
      {children}
    </Elements>
  );
}
