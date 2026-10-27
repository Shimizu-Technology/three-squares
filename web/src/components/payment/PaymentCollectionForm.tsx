import { forwardRef, lazy, Suspense } from 'react';
import type { CardPaymentHandle } from './PaymentForm';
import type { StripeClientConfiguration } from './StripeProvider';
import WorldpayHostedPage from './WorldpayHostedPage';

export interface CollectionConfiguration extends StripeClientConfiguration {
  simulation_enabled?: boolean;
  payment_processor?: string;
  payment_presentation?: string | null;
}
export interface CollectionFormProps {
  available: boolean;
  configuration: CollectionConfiguration | null;
  onPaymentReady: (ready: boolean) => void;
}
// Vite removes this branch and module from the production bundle. The server
// independently enforces deployment, identity, session and handle authority.
const StripeForm = lazy(() => import('./PaymentForm'));
const SimulatedFields = import.meta.env.DEV ? lazy(() => import('./simulation/SimulatedHostedFieldsForm')) : null;
export default forwardRef<CardPaymentHandle, CollectionFormProps>(function PaymentCollectionForm(props, ref) {
  if (!props.configuration?.payment_identity_id) return <p role="status" className="rounded-xl border p-6">Preparing payment for your pickup location…</p>;
  if (props.configuration?.payment_environment === 'simulated') {
    if (!SimulatedFields) return <p role="alert">Simulated payments are unavailable in this build.</p>;
    return <Suspense fallback={<p role="status">Preparing simulated payment…</p>}><SimulatedFields {...props} ref={ref} /></Suspense>;
  }
  if (props.configuration?.payment_processor === 'worldpay') {
    if (props.configuration.payment_presentation === 'worldpay_hosted_page') return <WorldpayHostedPage {...props} />;
    return <p role="status" className="rounded-xl border p-6">Worldpay card collection is awaiting its approved Hosted Fields contract. Your cart is saved.</p>;
  }
  return <Suspense fallback={<p role="status">Loading card form…</p>}><StripeForm {...props} ref={ref} /></Suspense>;
});
