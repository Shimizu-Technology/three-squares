import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import PaymentCollectionForm from './PaymentCollectionForm';
import PaymentEnvironmentBadge from './PaymentEnvironmentBadge';
import type { CardPaymentHandle } from './PaymentForm';
import { checkoutApi, checkoutClientConfiguration, type CheckoutState } from '../../services/checkout';

interface Props {
  sessionId: string;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onCheck: () => Promise<void>;
}
/** A POS-owned saved checkout. Card data stays inside the selected provider. */
export default function ManualCardDialog({ sessionId, getToken, onClose, onCheck }: Props) {
  const heading = useId();
  const form = useRef<CardPaymentHandle>(null);
  const [state, setState] = useState<CheckoutState | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paymentReady = useCallback((value: boolean) => setReady(value), []);
  useEffect(() => {
    let active = true;
    void getToken().then(token => checkoutApi.show(sessionId, token, '')).then(value => {
      if (active) setState(value);
    }).catch(() => { if (active) setError('Couldn’t load the saved payment. Close this form and check the original order.'); });
    return () => { active = false; };
  }, [sessionId, getToken]);
  useEffect(() => { setReviewed(false); }, [state?.amount_cents]);
  const config = state ? { ...checkoutClientConfiguration(state), checkout_session_id: state.id } : null;
  const available = !!config && (state?.environment === 'simulated' || state?.flow === 'worldpay_hosted_page' || !!(config.stripe_publishable_key && config.stripe_account_id));
  const hostedUrl = state?.flow === 'worldpay_hosted_page' ? state.collection_config.hosted_url : null;
  async function check() {
    await onCheck();
    const token = await getToken();
    setState(await checkoutApi.show(sessionId, token, ''));
  }
  async function pay() {
    if (!state || !reviewed || !ready || busy || !state.collection_config.client_secret || !form.current) return;
    setBusy(true); setError('');
    try {
      const result = await form.current.confirm(state.collection_config.client_secret, state.payment_identity_id, { name: '', email: '', phone: '' });
      if (result.error) throw new Error(result.error.message || 'Card was not accepted. Check the saved payment.');
      await check();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Payment outcome unknown. Check the saved payment before trying again.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} labelledBy={heading} dismissible={!busy}
    className="w-[min(36rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto rounded-xl bg-white p-5">
    <h2 id={heading} className="text-xl font-semibold">Hosted card payment</h2>
    <p className="my-3 text-sm">Use this saved POS order for manual card collection. Check any uncertain payment before taking another one.</p>
    {state && <>
      <PaymentEnvironmentBadge environment={state.environment} />
      <p className="my-3 font-medium">Order {state.order.order_number} · ${(state.amount_cents / 100).toFixed(2)}</p>
      <PaymentCollectionForm ref={form} available={available} configuration={config} onPaymentReady={paymentReady} />
      <label className="my-4 flex min-h-11 items-center gap-3"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this order and its ${(state.amount_cents / 100).toFixed(2)} total.</label>
      {hostedUrl ? <a href={reviewed ? hostedUrl : undefined} aria-disabled={!reviewed} target="_blank" rel="noopener noreferrer" className="btn-primary block text-center">Continue to Worldpay</a> :
        <button type="button" disabled={!reviewed || !ready || busy || !state.collection_config.client_secret} onClick={() => void pay()} className="btn-primary min-h-11 w-full disabled:opacity-50">{busy ? 'Checking payment…' : 'Pay saved order'}</button>}
      <p role="status" className="my-3 text-sm">Saved payment state: {state.payment_state.replaceAll('_', ' ')}</p>
    </>}
    {!state && !error && <p role="status">Loading saved payment…</p>}
    {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void check().catch(() => setError('Payment remains unresolved. Keep the saved order.')).finally(() => setBusy(false)); }} className="btn-secondary min-h-11">Check saved payment</button>
      <button type="button" disabled={busy} onClick={onClose} className="btn-secondary min-h-11">Close form</button>
    </div>
  </Dialog>;
}
