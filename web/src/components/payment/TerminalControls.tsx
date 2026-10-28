import { Disclosure } from '../ui/Disclosure';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useId } from 'react';
import type { PaymentTerminalHookState } from '../../hooks/usePaymentTerminal';
import PaymentEnvironmentBadge from './PaymentEnvironmentBadge';

export interface TerminalPendingState {
  orderNumber?: string | null;
  attemptId?: string | null;
  terminalId?: number | null;
  state?: string | null;
}
export interface TerminalControlsProps extends PaymentTerminalHookState {
  compact?: boolean;
  busy?: boolean;
  locked?: boolean;
  pending?: TerminalPendingState | boolean | null;
  onCheck?: () => void;
  onCancel?: () => void;
}
const statuses = {
  ready: 'Reader ready', waiting_for_card: 'Waiting for card', card_inserted: 'Card inserted',
  processing: 'Reader processing', offline: 'Reader offline', retired: 'Reader retired',
};

/** Reader feedback only. The parent owns the saved order and all financial actions. */
export default function TerminalControls({ terminals, selected, selectedId, select, reload, loading, error, compact = false, busy = false, locked = false, pending, onCheck, onCancel }: TerminalControlsProps) {
  const id = useId();
  const saved = typeof pending === 'object' ? pending : null;
  const unavailable = selectedId !== null && !terminals.some(row => row.id === selectedId);
  const occupied = !!selected?.attempt_id || (!!selected && ['waiting_for_card', 'card_inserted', 'processing'].includes(selected.status));
  const body = <>
    <div className="flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 space-y-1 font-medium">
        <span>Payment reader</span>
        <Select id={id} value={selectedId ?? ''} disabled={busy || locked || !!pending || loading}
          onChange={event => select(event.target.value ? Number(event.target.value) : null)}
          >
          <option value="">Choose a reader</option>
          {unavailable && <option value={selectedId!}>Saved reader #{selectedId} — unavailable</option>}
          {terminals.map(row => <option key={row.id} value={row.id} disabled={!row.enabled || row.status === 'retired' || row.collectable === false}>
            {row.label} · Lane {row.lane_id} · {row.environment}{!row.enabled ? ' · disabled' : ''}
          </option>)}
        </Select>
      </label>
      <Button variant="secondary" loading={loading} disabled={busy} onClick={() => void reload()}>Refresh readers</Button>
    </div>
    <div role="status" aria-live="polite" className="space-y-1">
      {loading && <p>Loading readers…</p>}
      {!loading && !error && terminals.length === 0 && <p>No readers are available at this location. Ask a manager to set one up.</p>}
      {selected && <>
        <p className="font-medium text-gray-900">{statuses[selected.status] ?? 'Reader status unknown'}{!selected.enabled ? ' · disabled' : ''}</p>
        <p>Connection: {selected.connection_state?.replaceAll('_', ' ') || 'not verified'}. Connection status does not confirm a payment.</p>
        <p>{selected.provider === 'worldpay' ? 'Worldpay' : 'Stripe'} · Lane {selected.lane_id} · Reader {selected.terminal_id}</p>
        <PaymentEnvironmentBadge environment={selected.environment} inline />
      </>}
      {busy && <p>Reader action in progress. Keep the current order open.</p>}
      {(!!pending || occupied) && <p className="font-medium text-amber-950">{saved?.state === 'unknown' ? 'Payment outcome unknown.' : 'Payment still needs resolution.'} Check the saved payment before taking another payment.</p>}
      {(saved?.orderNumber || selected?.order_number) && <p>Original order: <span className="font-semibold">{saved?.orderNumber || selected?.order_number}</span></p>}
      {saved?.attemptId && <p>Payment reference: {saved.attemptId}</p>}
      {unavailable && <p>The saved reader is unavailable in this list. Its selection is preserved; check the original payment.</p>}
    </div>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {(onCheck || onCancel) && <div className="flex flex-wrap gap-2">
      {onCheck && <Button variant="secondary" disabled={busy} onClick={onCheck}>Check saved payment</Button>}
      {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>Request cancellation</Button>}
    </div>}
    {onCancel && <p className="text-xs text-gray-600">A cancellation request does not confirm that a charge was stopped or reversed.</p>}
  </>;
  return <section aria-label="Payment reader" aria-busy={loading || busy} className="min-w-0 rounded-lg border border-gray-200 bg-white p-3 text-sm [overflow-wrap:anywhere]">
    {compact ? <div><Disclosure title={<>Reader: {selected?.label || 'Choose a reader'} · {busy ? 'Processing' : selected ? statuses[selected.status] : 'Unavailable'}{selected?.environment !== 'production' && selected ? ` · ${selected.environment}` : ''}</>}>
      <div className="max-h-[35dvh] space-y-3 overflow-y-auto pt-2">{body}</div>
    </Disclosure></div> : <div className="space-y-3">{body}</div>}
  </section>;
}
