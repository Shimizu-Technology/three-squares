import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { authGet } from '../../services/authApi';
import PaymentEnvironmentBadge from './PaymentEnvironmentBadge';
import type { PaymentEnvironment } from '../../types/paymentReceipt';

interface PaymentStatus {
  selected_provider: string;
  production_deployment: boolean;
  profiles: Array<{
    location_id: number | null; location_name: string; channel: 'online' | 'pos'; provider: string;
    profile_id: string | null; identity_id: string | null; environment: PaymentEnvironment | null;
    presentation: string | null; network_gate_enabled: boolean; real_dispatch_enabled: boolean; blockers: string[];
  }>;
}

/** A separate read request cannot overwrite the settings form's unrelated drafts. */
export default function PaymentStatusPanel() {
  const { getToken } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ revision: number; token: typeof getToken; data: PaymentStatus | null; error: boolean } | null>(null);
  const loading = result?.revision !== refresh || result.token !== getToken;
  const data = result?.data ?? null;
  const error = !loading && result.error;
  useEffect(() => {
    const controller = new AbortController();
    void authGet<PaymentStatus>('/admin/site_settings/payment_status', getToken, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult({ revision: refresh, token: getToken, data: response.data, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult(previous => ({ revision: refresh, token: getToken, data: previous?.data ?? null, error: true })); });
    return () => controller.abort();
  }, [getToken, refresh]);
  return <section aria-labelledby="payment-status-title" aria-busy={loading} className="min-w-0 space-y-4 border-b border-gray-200 pb-6 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="payment-status-title" className="font-semibold text-gray-900">Payments status</h3><p className="mt-1 max-w-3xl text-sm text-gray-600">Read-only server configuration for new payments. Existing payments and refunds keep their original account. Environment guards cannot be changed here.</p></div><Button variant="secondary" type="button" loading={loading} onClick={() => setRefresh(value => value + 1)}>Refresh payments status</Button></div>
    {loading && <p role="status">Loading payments status…</p>}
    {error && <div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900"><p>Payments status could not be loaded. {data && 'Previously loaded status may be out of date.'}</p><Button variant="secondary" type="button" onClick={() => setRefresh(value => value + 1)}>Retry payments status</Button></div>}
    {data && !loading && !error && <>
      <p className="text-sm font-medium text-gray-900">Selected provider for new payments: {data.selected_provider === 'worldpay' ? 'Worldpay' : 'Stripe'}. {data.production_deployment ? 'Production deployment.' : 'Non-production deployment.'}</p>
      <p className="text-sm text-gray-600">These checks do not prove processor certification or a successful charge. Credential, profile, device and launch approval remain operator-managed.</p>
      <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{data.profiles.map(row => <li key={`${row.location_id ?? 'default'}:${row.channel}`} className="min-w-0 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <h4 className="font-semibold text-gray-900">{row.location_name} · {row.channel === 'online' ? 'Online / hosted card' : 'POS reader'}</h4>
        <p>{row.provider === 'worldpay' ? 'Worldpay' : 'Stripe'} · {row.environment ?? 'No profile configured'}</p>
        {row.environment && <PaymentEnvironmentBadge environment={row.environment} />}
        <p className="font-medium">Real processor requests: {row.real_dispatch_enabled ? 'Enabled, subject to payment validation' : 'Blocked / disabled'}</p>
        {row.environment !== 'simulated' && <p>Processor network gate: {row.network_gate_enabled ? 'On' : 'Off'}</p>}
        {row.environment === 'simulated' && <p>Simulation only. No money moves and no processor request is sent.</p>}
        {!!row.blockers.length && <ul className="list-disc space-y-1 pl-5 text-amber-950">{row.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        {row.identity_id && <Disclosure title="Original payment configuration"><dl className="space-y-1"><div><dt className="font-medium">Payment identity</dt><dd>{row.identity_id}</dd></div><div><dt className="font-medium">Payment profile</dt><dd>{row.profile_id}</dd></div><div><dt className="font-medium">Collection method</dt><dd>{row.presentation}</dd></div></dl></Disclosure>}
      </li>)}</ul>
    </>}
  </section>;
}
