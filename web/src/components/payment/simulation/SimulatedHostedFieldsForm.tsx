import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import type { CardPaymentHandle } from '../PaymentForm';
import type { CollectionFormProps } from '../PaymentCollectionForm';
import { checkoutApi, pendingCheckout } from '../../../services/checkout';
import { useAuth } from '@clerk/clerk-react';

import { SimulatedHostedFieldsBridge } from './SimulatedHostedFieldsBridge';

const scenarios = ['null_amounts', 'approve', 'decline', 'expired', 'partial', 'duplicate', 'idempotent_replay', 'key_mismatch', 'timeout_before_dispatch', 'timeout_after_approval', 'network_error', 'host_error', 'avs_fail', 'cvv_fail', 'cancel_before_card', 'cancel_race', 'query_lag', 'malformed_response', 'refund_timeout', 'refund_decline', 'late_event', 'duplicate_event'];
// Fake fields never ask for PAN, CVV or PIN. Both contracts drive the same
// application bridge: token execution or hosted execution, never both.
export default forwardRef<CardPaymentHandle, CollectionFormProps>(function SimulatedHostedFieldsForm({ onPaymentReady, configuration }, ref) {
  const container = useRef<HTMLElement>(null);
  const [scenario, setScenario] = useState('approve');
  const [mode, setMode] = useState<'token' | 'hosted'>('token');
  const { getToken, isSignedIn } = useAuth();
  useEffect(() => { onPaymentReady(true); return () => onPaymentReady(false); }, [onPaymentReady]);
  useImperativeHandle(ref, () => ({
    async confirm(handle, identityId) {
      if (!identityId || identityId !== configuration?.payment_identity_id) throw new Error('Payment identity changed. Check the saved order.');
      const saved = pendingCheckout();
      if (!saved) throw new Error('Save the checkout before collecting payment.');
      if (!container.current) throw new Error('Payment fields are unavailable.');
      const execute = async () => checkoutApi.simulate(saved.id, isSignedIn ? await getToken() : null, saved.capability, handle, scenario, mode);
      let tokenReady = false;
      const bridge = new SimulatedHostedFieldsBridge(() => handle, execute);
      bridge.mount(container.current, { sessionId: saved.id, identityId, mode }, {
        ready() {}, validation() {}, instrumentReady() { tokenReady = true; }, completed() {}, cancelled() {}, error() {},
      });
      try {
        await bridge.submit();
        if (tokenReady) await execute();
      } finally { bridge.destroy(); }
      return {};
    },
  }), [configuration?.payment_identity_id, scenario, mode, getToken, isSignedIn]);
  return <section ref={container} className="rounded-xl border border-amber-300 bg-amber-50 p-6 space-y-4" aria-label="Simulated payment">
    <h2 className="font-bold text-lg text-amber-950">Simulated payments — no money moves</h2>
    <p className="text-sm text-amber-950">Use a fictional card outcome. Do not enter real card details.</p>
    <label className="block font-medium">Card outcome<select className="block mt-2 w-full min-h-11 rounded border bg-white p-2 text-base" value={scenario} onChange={event => setScenario(event.target.value)}>{scenarios.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
    <label className="block font-medium">Collection contract<select className="block mt-2 w-full min-h-11 rounded border bg-white p-2 text-base" value={mode} onChange={event => setMode(event.target.value as 'token' | 'hosted')}><option value="token">Opaque instrument handle</option><option value="hosted">Hosted execution</option></select></label>
    <p className="text-sm">Simulation card •••• 4242 · Ready</p>
  </section>;
});
