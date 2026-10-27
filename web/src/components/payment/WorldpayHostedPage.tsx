import { useEffect } from 'react';
import type { CollectionFormProps } from './PaymentCollectionForm';

export default function WorldpayHostedPage({ available, onPaymentReady }: CollectionFormProps) {
  useEffect(() => {
    onPaymentReady(available);
    return () => onPaymentReady(false);
  }, [available, onPaymentReady]);
  return <div className="rounded-xl border border-gray-200 p-6" role="status">
    <p className="font-semibold">Secure Worldpay checkout</p>
    <p className="mt-2 text-sm text-gray-600">Review your order below. Continue to Worldpay to enter your card details and complete payment. Your order is saved before you leave this page.</p>
  </div>;
}
