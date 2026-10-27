import { cloneElement, isValidElement, useId, useState, type ReactNode } from 'react';
import type { GetTokenFn } from '../../../services/authApi';
import {
  accountingErrorMessage, accountingErrorStatus, downloadAccountingCSV, formatAccountingCents,
  type AccountingAction, type AccountingContext, type AccountingReport, type PendingAccountingAction,
} from '../../../services/paymentReconciliation';

const control = 'min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base disabled:opacity-60';
const button = 'min-h-11 touch-manipulation select-none rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition-none! active:transform-none! active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-50';
const scenarios = ['ordinary', 'combined', 'split', 'weekend', 'missing', 'duplicate', 'mismatch', 'external_refund'] as const;
interface Props {
  report: AccountingReport; context: AccountingContext; getToken: GetTokenFn;
  disabled: boolean; busy: boolean; pending: PendingAccountingAction | null;
  onStart: (action: AccountingAction) => Promise<void>;
  onRetry: (action: PendingAccountingAction) => Promise<void>;
}
/** This entire module is dynamically imported only in development by the authorized page. */
export default function SimulatedReconciliationPanel({ report, context, getToken, disabled, busy, pending, onStart, onRetry }: Props) {
  const [scenario, setScenario] = useState<string>('ordinary');
  const [lag, setLag] = useState('2');
  const [fee, setFee] = useState('0');
  const [attemptId, setAttemptId] = useState('');
  const [importId, setImportId] = useState('');
  const [voidReview, setVoidReview] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const selectedAttempt = report.voidable_attempts.find(row => String(row.attempt_id) === attemptId);
  const voidFingerprint = selectedAttempt ? JSON.stringify(selectedAttempt) : null;
  const selectedImport = report.imports.find(row => String(row.id) === importId && row.source === 'simulator');
  const lagNumber = /^\d+$/.test(lag) ? Number(lag) : NaN;
  const feeNumber = /^\d+$/.test(fee) ? Number(fee) : NaN;
  const validClose = Number.isInteger(lagNumber) && lagNumber >= 0 && lagNumber <= 14 && Number.isInteger(feeNumber) && feeNumber >= 0 && feeNumber <= 10000;
  const savedMutation = pending && ['simulate_close', 'advance_simulation', 'simulate_void'].includes(pending.kind) ? pending : null;
  const locked = disabled || downloading;
  const download = async () => {
    if (!selectedImport || busy || downloading) return;
    setDownloading(true); setError('');
    try { await downloadAccountingCSV('/simulated_funding', { ...context, import_id: selectedImport.id }, getToken, 'simulated-funding.csv'); }
    catch (cause) { setError(`${accountingErrorStatus(cause) === 422 ? 'Funding is not due yet or this scenario has no funding file. ' : ''}${accountingErrorMessage(cause)}`); }
    finally { setDownloading(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 [overflow-wrap:anywhere]" aria-label="Simulated accounting tools">
    <h2 className="text-lg font-semibold">Simulated accounting tools</h2>
    <p className="text-sm">Owner-only development controls. No money moves. Fees and deposits are synthetic, with no claim about actual bank pricing or deposit timing.</p>
    <p className="text-sm font-semibold">Isolated accounting time: {report.accounting_time ?? 'Not initialized; the first accounting action initializes it'}</p>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{error}</p>}
    {savedMutation && <div className="space-y-3 rounded-lg border border-amber-300 bg-white p-4">
      <h3 className="font-semibold">Recover original simulated action</h3>
      <p className="text-sm">Retry uses the exact saved payload and key, including after reload. It never selects a replacement order or changes payment clocks.</p>
      <pre className="whitespace-pre-wrap font-sans text-sm">{JSON.stringify(savedMutation.kind === 'simulate_void' ? { action: 'Full current-batch void', attempt_id: savedMutation.attempt_id, order_number: savedMutation.order_number, amount_cents: savedMutation.amount_cents }
        : savedMutation.kind === 'simulate_close' ? { action: 'Batch close', scenario: savedMutation.scenario, lag_days: savedMutation.lag_days, fee_cents: savedMutation.fee_cents }
          : savedMutation.kind === 'advance_simulation' ? { action: 'Accounting clock advance', seconds: savedMutation.seconds } : {}, null, 2)}</pre>
      {savedMutation.kind === 'simulate_void' && <p className="text-sm">Original order {savedMutation.order_number} · Attempt #{savedMutation.attempt_id} · Full amount {formatAccountingCents(savedMutation.amount_cents)}. No restocking.</p>}
      <button type="button" className={button} disabled={busy || downloading} onClick={() => void onRetry(savedMutation)}>Check / retry original simulated action</button>
    </div>}
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (validClose && !locked) void onStart({ kind: 'simulate_close', scenario, lag_days: lagNumber, fee_cents: feeNumber }); }}>
      <h3 className="font-semibold">Close persisted simulated ledger entries</h3>
      <p className="text-sm">Creates observational batches from new ledger entries. Funding arrives only through a separate CSV import.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Funding scenario"><select className={control} value={scenario} disabled={locked} onChange={event => setScenario(event.target.value)}>{scenarios.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
        <Field label="Funding lag (0–14 days)"><input type="number" min={0} max={14} step={1} required inputMode="numeric" className={control} value={lag} disabled={locked} onChange={event => setLag(event.target.value)} /></Field>
        <Field label="Synthetic fee (0–10,000 cents)"><input type="number" min={0} max={10000} step={1} required inputMode="numeric" className={control} value={fee} disabled={locked} onChange={event => setFee(event.target.value)} /></Field>
      </div>
      <button className={button} disabled={locked || !validClose}>Close simulated batches</button>
    </form>
    <div className="space-y-3 border-t border-amber-300 pt-4">
      <h3 className="font-semibold">Advance isolated accounting clock</h3>
      <p className="text-sm">Advances accounting time by three days. Payment clocks and payment processing remain unchanged. A lost response preserves the original advance and key.</p>
      <button type="button" className={button} disabled={locked} onClick={() => void onStart({ kind: 'advance_simulation', seconds: 259200 })}>Advance accounting time by 3 days</button>
    </div>
    <div className="space-y-3 border-t border-amber-300 pt-4">
      <h3 className="font-semibold">Download future funding observations</h3>
      <p className="text-sm">Select a saved simulator close. Once its funding is due, download its deposit/allocation CSV, then select that file in the canonical CSV import above. Downloading does not import it.</p>
      <Field label="Saved simulator close"><select className={control} value={importId} disabled={busy || downloading} onChange={event => setImportId(event.target.value)}><option value="">Choose a saved close</option>{report.imports.filter(row => row.source === 'simulator').map(row => <option key={row.id} value={row.id}>Import #{row.id} · {row.state} · {row.processed_at ?? 'Not processed'}</option>)}</select></Field>
      <button type="button" className={button} disabled={busy || downloading || !selectedImport} onClick={() => void download()}>{downloading ? 'Downloading funding CSV…' : 'Download simulated funding CSV'}</button>
    </div>
    <div className="space-y-3 border-t border-amber-300 pt-4">
      <h3 className="font-semibold">Full current-batch void</h3>
      <p className="text-sm">Only full, unrefunded, unbatched attempts supplied by the report are eligible. Choose the exact attempt and review its full amount. This does not restock items.</p>
      <Field label="Eligible payment attempt"><select className={control} value={attemptId} disabled={locked} onChange={event => { setAttemptId(event.target.value); setVoidReview(null); }}><option value="">Choose an exact attempt</option>{report.voidable_attempts.map(row => <option key={row.attempt_id} value={row.attempt_id}>{row.order_number} · Attempt #{row.attempt_id} · {formatAccountingCents(row.amount_cents)}</option>)}</select></Field>
      {!report.voidable_attempts.length && <p className="text-sm">No eligible attempts are available. Refresh after a new simulated payment.</p>}
      {selectedAttempt && <div className="space-y-2 rounded-lg border border-amber-300 bg-white p-3"><p className="font-semibold">Order {selectedAttempt.order_number} · Attempt #{selectedAttempt.attempt_id}</p><p>Full void amount: {formatAccountingCents(selectedAttempt.amount_cents)} ({selectedAttempt.amount_cents} cents)</p><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0" checked={!!voidFingerprint && voidReview === voidFingerprint} disabled={locked} onChange={event => setVoidReview(event.target.checked ? voidFingerprint : null)} />I reviewed this exact attempt and full amount; no restock is requested.</label><button type="button" className={button} disabled={locked || !voidFingerprint || voidReview !== voidFingerprint} onClick={() => { setVoidReview(null); void onStart({ kind: 'simulate_void', attempt_id: selectedAttempt.attempt_id, order_number: selectedAttempt.order_number, amount_cents: selectedAttempt.amount_cents }); }}>Void this exact simulated attempt in full</button></div>}
    </div>
  </section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="block min-w-0 space-y-1 text-sm font-medium"><label htmlFor={id} className="block">{label}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}
