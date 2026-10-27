import { useMemo, type ReactNode } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

export interface StripeClientConfiguration {
  payment_identity_id?: string;
  payment_environment?: string;
  stripe_account_id?: string;
  stripe_publishable_key?: string;
}

export default function StripeProvider({ children, configuration }: { children: ReactNode; configuration: StripeClientConfiguration | null }) {
  const publicKey = configuration?.stripe_publishable_key;
  const account = configuration?.stripe_account_id;
  const stripePromise = useMemo(() => publicKey && account ? loadStripe(publicKey, { stripeAccount: account }) : null, [publicKey, account]);
  // Account changes replace Elements and its card data, preserving the checkout form.
  return <Elements key={`${configuration?.payment_identity_id}:${publicKey}:${account}`} stripe={stripePromise}>{children}</Elements>;
}
