import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { authGet, authPut } from '../../services/authApi';
import { invalidateAppConfig } from '../../hooks/useAppConfig';
import { useStaffAccess } from './StaffAccess.tsx';
import Dialog from '../ui/Dialog';

interface OrderingState {
  paused: boolean;
  customer_message: string | null;
  effective_message: string;
  history: { id: number; actor: string; paused: boolean; customer_message: string | null; changed_at: string }[];
}

function OwnerOrderingSection() {
  const { getToken } = useAuth();
  const [saved, setSaved] = useState<OrderingState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const titleId = useId();
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setBusy(true);
    setConfirmed(false);
    try {
      const { data } = await authGet<OrderingState>('/admin/online_ordering', getToken, { timeout: 15_000 });
      if (id !== requestId.current) return;
      setSaved(data);
      setMessage(data.customer_message ?? '');
      setConfirmed(true);
      setError(null);
    } catch {
      if (id === requestId.current) setError('Could not check the saved ordering status. Retry before making changes.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  const save = async () => {
    if (pending === null || busy) return;
    const id = ++requestId.current;
    setBusy(true);
    setConfirmed(false);
    try {
      const { data } = await authPut<OrderingState>('/admin/online_ordering', { online_ordering: { paused: pending, customer_message: message } }, getToken, { timeout: 15_000 });
      if (id !== requestId.current) return;
      setSaved(data);
      setMessage(data.customer_message ?? '');
      setConfirmed(true);
      setError(null);
      invalidateAppConfig();
    } catch {
      if (id === requestId.current) setError('We could not confirm whether the change was saved. Check saved status before trying again.');
    } finally {
      if (id === requestId.current) { setBusy(false); setPending(null); }
    }
  };

  return <section aria-labelledby="online-ordering-title" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
    <div>
      <h2 id="online-ordering-title" className="text-lg font-bold text-gray-900">Online ordering</h2>
      <p className="mt-1 text-sm text-gray-700">Pause new customer orders while keeping menu browsing, staff sales, pickup queues, and saved payment recovery available.</p>
    </div>
    <p role="status" className="font-medium text-gray-900">{busy ? 'Checking or saving ordering status…' : confirmed && saved ? `Saved status: ${saved.paused ? 'Paused' : 'Accepting online orders'}` : 'Saved status needs to be checked'}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="block text-sm font-medium text-gray-900">Customer message (optional)
      <textarea maxLength={240} rows={3} value={message} onChange={event => setMessage(event.target.value)} disabled={busy || !confirmed} className="mt-2 block w-full rounded-lg border border-gray-300 p-3 text-base disabled:opacity-60" />
    </label>
    <p className="text-sm text-gray-700">Shown while paused. Leave blank to use the standard message. This does not change store hours or whether the API is connected.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn-primary min-h-11 disabled:opacity-50" disabled={busy || !confirmed || !saved} onClick={() => setPending(!saved?.paused)}>{saved?.paused ? 'Resume online ordering' : 'Pause online ordering'}</button>
      <button type="button" className="btn-secondary min-h-11 disabled:opacity-50" disabled={busy || !confirmed || !saved || message === (saved.customer_message ?? '')} onClick={() => setPending(saved!.paused)}>Save customer message</button>
      <button type="button" className="min-h-11 px-2 underline disabled:opacity-50" disabled={busy} onClick={() => void load()}>Check saved status</button>
    </div>
    {saved && saved.history.length > 0 && <div className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Recent changes</h3>
      <ul className="mt-2 space-y-2 text-sm text-gray-700">{saved.history.map(change => <li key={change.id} className="break-words">
        {change.actor} · {change.paused ? 'Paused' : 'Accepting online orders'} · {new Date(change.changed_at).toLocaleString('en-US', { timeZone: 'Pacific/Guam' })} (Guam)
        {change.customer_message && <span className="block">Message: {change.customer_message}</span>}
      </li>)}</ul>
    </div>}
    <Dialog open={pending !== null} onOpenChange={open => { if (!open && !busy) setPending(null); }} labelledBy={titleId} dismissible={!busy} className="w-full max-w-lg rounded-xl p-6">
      <h2 id={titleId} className="text-xl font-bold text-gray-900">{pending ? 'Pause online ordering?' : 'Save online ordering as accepting orders?'}</h2>
      <p className="mt-3 text-gray-700">{pending ? 'New customer cart additions and payments will be refused. Customers can browse the menu. Staff can keep using POS and pickup queues. Payments already sent for processing will still be checked and completed.' : 'New customer orders can start again, subject to menu availability, store hours, and payment readiness.'}</p>
      {pending && <p className="mt-3 break-words text-sm text-gray-700">Customer message: {message.trim() || 'Online ordering is temporarily paused. You can still browse the menu. Please check back soon.'}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => setPending(null)} disabled={busy} className="btn-secondary min-h-11">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary min-h-11">{busy ? 'Saving…' : 'Confirm change'}</button>
      </div>
    </Dialog>
  </section>;
}

export default function OnlineOrderingSection() {
  const { can } = useStaffAccess();
  return can('ordering.manage') ? <OwnerOrderingSection /> : null;
}
