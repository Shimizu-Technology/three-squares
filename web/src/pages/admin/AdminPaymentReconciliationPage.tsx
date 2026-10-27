import { cloneElement, isValidElement, lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useSearchParams } from 'react-router-dom';
import { StaffAccessDenied, useStaffAccess, type StaffAccessUser } from '../../components/admin/StaffAccess.tsx';
import PaymentEnvironmentBadge from '../../components/payment/PaymentEnvironmentBadge';
import type { GetTokenFn } from '../../services/authApi';
import type { PaymentEnvironment } from '../../types/paymentReceipt';
import {
  accountingErrorMessage, accountingErrorStatus, accountingFileDigest, accountingStorageKey,
  assertSavedAccountingAction, checkAccountingImport, clearAccountingAction, confirmedAccountingResult, defaultAccountingDates,
  dispatchAccountingAction, downloadAccountingCSV, formatAccountingCents, getAccountingBatch,
  getAccountingReport, MAX_ACCOUNTING_FILE_BYTES, parseSignedCents, prepareAccountingAction,
  readAccountingAction, rejectedAccountingResult, sameAccountingContext, validAccountingDates,
  type AccountingAction, type AccountingBatch, type AccountingContext, type AccountingIndex,
  type AccountingReport, type BatchDetail, type PendingAccountingAction,
} from '../../services/paymentReconciliation';

const SimulatedReconciliationPanel = import.meta.env.DEV ? lazy(() => import('../../components/payment/simulation/SimulatedReconciliationPanel')) : null;
const control = 'min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base disabled:opacity-60';
const button = 'min-h-11 touch-manipulation select-none rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition-none! active:transform-none! active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-50';
const primary = `${button} border-tsPrimary bg-tsPrimary text-white active:bg-tsNavy [@media(hover:hover)_and_(pointer:fine)]:hover:bg-tsNavy`;
const card = 'min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-5';
const positiveId = (s: string | null) => s && /^[1-9]\d*$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : undefined;
const message = (error: unknown) => `${accountingErrorStatus(error) ? `HTTP ${accountingErrorStatus(error)}: ` : ''}${accountingErrorMessage(error)}`;

/** Parent owns route/navigation and central capability registration. No requests mount before this gate. */
export default function AdminPaymentReconciliationPage() {
  const access = useStaffAccess();
  const { getToken } = useAuth();
  if (access.loading) return <p role="status" className="p-6">Checking accounting access…</p>;
  const user = access.user;
  const allowed = user && (user.role === 'owner' || user.role === 'manager') && user.operational_scope === 'all' && access.can('payments.reconcile');
  if (!allowed || !user) return <StaffAccessDenied />;
  return <ReconciliationWorkspace key={`${user.id}:${user.clerk_id}:${user.role}:${user.operational_scope}:${user.capabilities.join(',')}`} user={user} canSimulate={user.role === 'owner' && access.can('payments.simulate')} getToken={getToken} />;
}

function ReconciliationWorkspace({ user, canSimulate, getToken }: { user: StaffAccessUser; canSimulate: boolean; getToken: GetTokenFn }) {
  const [search, setSearch] = useSearchParams();
  const defaults = useRef(defaultAccountingDates()).current;
  const requestedEnvironment = search.get('environment') || 'production';
  const environment: PaymentEnvironment = requestedEnvironment === 'sandbox' ? 'sandbox' : requestedEnvironment === 'simulated' && import.meta.env.DEV && canSimulate ? 'simulated' : 'production';
  const forbiddenEnvironment = requestedEnvironment !== environment;
  const identityId = search.get('identity_id') || undefined;
  const locationId = positiveId(search.get('location_id'));
  const batchId = search.get('batch_id') || undefined;
  const from = search.get('from') || defaults.from;
  const to = search.get('to') || defaults.to;
  const queryKey = JSON.stringify({ environment, identityId, locationId, from, to });
  const datesValid = validAccountingDates(from, to);
  const [data, setData] = useState<{ key: string; value: AccountingIndex } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState(readAccountingAction);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [importMissing, setImportMissing] = useState<string | null>(null);
  const [rejectedKey, setRejectedKey] = useState<string | null>(null);
  const [file, setFile] = useState<{ digest: string; csv: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [allocation, setAllocation] = useState({ batch: '', deposit: '', cents: '', reason: '' });
  const [confirmation, setConfirmation] = useState<AccountingAction | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const alive = useRef(false);
  const activeView = useRef(queryKey);
  const fileSequence = useRef(0);
  const inputId = useId();
  const current = data?.key === queryKey ? data.value : null;
  const report = current?.report ?? null;
  const context: AccountingContext | null = report ? { identity_id: report.identity.id, environment: report.identity.environment } : null;
  const pending = saved.pending;
  const matches = !!pending && !!context && sameAccountingContext(pending, user.id, context);
  const ready = !!context && !loading && !loadError && datesValid && !forbiddenEnvironment;
  const disabled = !ready || busy || fileBusy || saved.blocked || !!pending;
  const reload = useCallback(async () => { setRefresh(value => value + 1); }, []);
  const setFilter = (name: string, value: string) => {
    setSearch(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(name, value); else next.delete(name);
      if (name !== 'batch_id') next.delete('batch_id');
      if (name === 'environment') { next.delete('identity_id'); next.delete('location_id'); }
      return next;
    });
  };

  useEffect(() => {
    alive.current = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key === accountingStorageKey || event.key === null) {
        setSaved(readAccountingAction()); setConfirmation(null); setRejectedKey(null); setImportMissing(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { alive.current = false; fileSequence.current += 1; window.removeEventListener('storage', onStorage); };
  }, []);
  useEffect(() => {
    activeView.current = queryKey;
    const abort = new AbortController();
    setLoading(true); setLoadError(''); setConfirmation(null);
    if (!datesValid || forbiddenEnvironment) { setLoading(false); return () => abort.abort(); }
    void getAccountingReport({ environment, identity_id: identityId, location_id: locationId, from, to }, getToken, abort.signal)
      .then(value => {
        if (!abort.signal.aborted) {
          if (value.report && (value.report.identity.environment !== environment || (identityId && value.report.identity.id !== identityId))) throw new Error('The returned account does not match the selected account.');
          setData({ key: queryKey, value });
        }
      })
      .catch(cause => { if (!abort.signal.aborted) setLoadError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [environment, identityId, locationId, from, to, queryKey, datesValid, forbiddenEnvironment, getToken, refresh]);
  useEffect(() => {
    fileSequence.current += 1; setFile(null); setFileInputKey(value => value + 1); setFileBusy(false);
    setConfirmation(null); setAllocation({ batch: '', deposit: '', cents: '', reason: '' }); setNotice(''); setError(''); setResult(null);
  }, [identityId, environment]);

  const chooseFile = async (selected?: File) => {
    const sequence = ++fileSequence.current;
    setFile(null); setError('');
    if (!selected) return;
    if (!selected.size || selected.size > MAX_ACCOUNTING_FILE_BYTES) { setError('Choose a nonempty CSV file up to 1 MiB.'); return; }
    setFileBusy(true);
    try {
      const bytes = await selected.arrayBuffer();
      const digest = await accountingFileDigest(bytes);
      const csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (alive.current && sequence === fileSequence.current) setFile({ digest, csv });
    } catch { if (alive.current && sequence === fileSequence.current) setError('Could not read this CSV as UTF-8. Choose a nonempty UTF-8 file up to 1 MiB.'); }
    finally { if (alive.current && sequence === fileSequence.current) setFileBusy(false); }
  };

  const dispatch = async (operation: PendingAccountingAction) => {
    if (active.current || !ready || !context || !sameAccountingContext(operation, user.id, context)) return;
    if (['simulate_close', 'advance_simulation', 'simulate_void'].includes(operation.kind) && (!import.meta.env.DEV || !canSimulate || environment !== 'simulated')) return;
    if (operation.kind === 'import' && (!file || file.digest !== operation.file_sha256)) { setError('Reselect the original CSV. Its SHA-256 must match the saved file.'); return; }
    active.current = true; setBusy(true); setError(''); setNotice(''); setResult(null); setRejectedKey(null);
    feedback.current?.focus();
    try {
      assertSavedAccountingAction(operation, user.id, context);
      const guardedToken = async () => {
        const token = await getToken();
        if (!alive.current) throw new Error('Signed-in account changed.');
        assertSavedAccountingAction(operation, user.id, context);
        return token;
      };
      const response = await dispatchAccountingAction(operation, guardedToken, operation.kind === 'import' ? file?.csv : undefined);
      if (!alive.current || activeView.current !== queryKey) return;
      setResult(response.data);
      if (!confirmedAccountingResult(operation, response)) {
        setError('The saved request is still unconfirmed. Keep its original details and key; check or retry that same request.');
      } else {
        clearAccountingAction(operation); setSaved(readAccountingAction()); setImportMissing(null);
        if (response.data.success === false) setError('The saved request returned a failure. Review its result below.');
        else setNotice('Saved accounting result received. Review the result below.');
        if (operation.kind === 'import') { setFile(null); setFileInputKey(value => value + 1); }
      }
      await reload();
    } catch (cause) {
      if (alive.current && activeView.current === queryKey) {
        setSaved(readAccountingAction());
        const status = accountingErrorStatus(cause);
        const response = (cause as { response?: { status: number; data: Record<string, unknown> } }).response;
        const rejected = response && rejectedAccountingResult(operation, response);
        if (rejected) setRejectedKey(operation.key);
        setError(`${message(cause)} ${rejected ? 'This original request was durably rejected. Acknowledge it below to prepare corrected details.' : status === 409 ? 'The saved key conflicts with a different request. Do not replace it.' : 'The original request remains saved. Check or retry it before starting another.'}`);
      }
    } finally { active.current = false; if (alive.current) setBusy(false); }
  };
  const start = async (action: AccountingAction) => {
    if (disabled || active.current || !context) return;
    try {
      const operation = prepareAccountingAction(action, user.id, context);
      setSaved({ pending: operation, blocked: false }); setConfirmation(null);
      await dispatch(operation);
    } catch (cause) { setSaved(readAccountingAction()); setError(message(cause)); }
  };
  const checkImport = async () => {
    if (active.current || !pending || pending.kind !== 'import' || !matches || !context || !ready) return;
    const operation = pending;
    active.current = true; setBusy(true); setError(''); setNotice('');
    try {
      assertSavedAccountingAction(operation, user.id, context);
      const found = await checkAccountingImport(context, operation.key, async () => {
        const token = await getToken();
        if (!alive.current) throw new Error('Signed-in account changed.');
        assertSavedAccountingAction(operation, user.id, context); return token;
      });
      if (!alive.current || activeView.current !== queryKey) return;
      if (rejectedAccountingResult(operation, { status: 200, data: { ...found } })) { setRejectedKey(operation.key); setImportMissing(null); setError('The server saved a rejection for this original request. You can acknowledge it before preparing corrected details.'); return; }
      if (!confirmedAccountingResult(operation, { status: 200, data: { ...found } })) throw new Error('The saved import does not confirm this original file and key. Preserve the request and resolve the conflict before continuing.');
      clearAccountingAction(operation); setSaved(readAccountingAction()); setResult({ ...found }); setNotice('Saved import found. Review its state and summary below.'); setImportMissing(null); await reload();
    } catch (cause) {
      if (alive.current && activeView.current === queryKey) {
        if (accountingErrorStatus(cause) === 404) { setImportMissing(operation.key); setError('No durable import was found yet (404). Reselect the same file, verify its SHA-256, and replay the original key. Keep this saved request.'); }
        else setError(message(cause));
      }
    } finally { active.current = false; if (alive.current) setBusy(false); }
  };
  const exportCSV = async () => {
    if (!context || !ready || active.current) return;
    active.current = true; setBusy(true); setError('');
    try { await downloadAccountingCSV('/export', context, getToken, 'payment-reconciliation.csv'); }
    catch (cause) { if (alive.current) setError(message(cause)); }
    finally { active.current = false; if (alive.current) setBusy(false); }
  };
  const prepareAllocation = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseSignedCents(allocation.cents);
    if (amount === null) { setError('Enter a signed, nonzero integer number of cents.'); return; }
    const batch = report?.batches.find(row => String(row.id) === allocation.batch);
    const deposit = report?.deposits.find(row => String(row.id) === allocation.deposit);
    if (!batch || !deposit || !allocation.reason.trim()) return;
    setConfirmation({ kind: 'allocate', batch_id: batch.id, deposit_id: deposit.id, amount_cents: amount, reason: allocation.reason.trim() });
  };

  return <div className="min-w-0 space-y-6 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-gray-900 [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2"><h1 className="text-2xl font-bold">Payment reconciliation</h1><p className="max-w-3xl text-sm text-gray-600">Compare recorded batches with funding deposits, allocate amounts, and acknowledge exceptions.</p><PaymentEnvironmentBadge environment={environment} /></div>
      <button type="button" className={button} disabled={loading || busy} onClick={() => void reload()}>Refresh report</button>
    </header>
    <section className={card} aria-labelledby={`${inputId}-filters`}>
      <h2 id={`${inputId}-filters`} className="text-lg font-semibold">Report filters</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Environment"><select className={control} value={environment} disabled={busy} onChange={event => setFilter('environment', event.target.value)}><option value="production">Production</option><option value="sandbox">Sandbox</option>{import.meta.env.DEV && canSimulate && <option value="simulated">Simulated</option>}</select></Field>
        <Field label="Payment account"><select className={control} value={identityId ?? report?.identity.id ?? ''} disabled={loading || busy || !current?.accounts.length} onChange={event => setFilter('identity_id', event.target.value)}><option value="" disabled>Choose an account</option>{current?.accounts.map(account => <option key={account.id} value={account.id}>{account.provider} · {account.account_id} · {account.currency}</option>)}</select></Field>
        <Field label="From (Guam)"><input type="date" className={control} value={from} disabled={busy} onChange={event => setFilter('from', event.target.value)} /></Field>
        <Field label="Through (Guam)"><input type="date" className={control} value={to} disabled={busy} onChange={event => setFilter('to', event.target.value)} /></Field>
        <Field label="Batch location"><select className={control} value={locationId ?? ''} disabled={busy || loading} onChange={event => setFilter('location_id', event.target.value)}><option value="">All locations</option>{report?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
      </div>
      <p className="text-sm text-gray-600">Dates are Guam business dates (Pacific/Guam). Choose up to 366 days. Deposits show their full account-level amounts and allocations, including other locations or batches outside these filters. Their actual deposit dates are shown separately.</p>
      {forbiddenEnvironment && <p role="alert">This environment is unavailable. <button className={button} onClick={() => setFilter('environment', 'production')}>Use production</button></p>}
      {!datesValid && <p role="alert" className="text-red-800">Use valid YYYY-MM-DD dates in order, spanning no more than 366 days.</p>}
    </section>
    <div ref={feedback} tabIndex={-1} aria-label="Accounting request status" className="space-y-4">
    {busy && <p role="status">Waiting for the accounting server…</p>}
    {saved.blocked && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4">Saved accounting recovery data is unreadable. New changes are blocked. Preserve this browser’s data and contact an administrator to resolve the original request.</p>}
    {pending && <section className={`${card} border-amber-300 bg-amber-50`} aria-labelledby={`${inputId}-pending`}>
      <h2 id={`${inputId}-pending`} className="text-lg font-semibold">Saved request needs resolution</h2>
      <p className="text-sm">Account #{pending.identity_id} · {pending.environment} · Request key: {pending.key}</p>
      {pending.actor_id !== user.id ? <p role="alert">This request belongs to another signed-in user. Only the original user can check or replay it. New changes are blocked.</p> : !matches ? <div className="space-y-2"><p role="alert">Return to the original account and environment to check this request. New changes are blocked.</p>{(pending.environment !== 'simulated' || (import.meta.env.DEV && canSimulate)) && <button type="button" className={button} onClick={() => setSearch(previous => { const next = new URLSearchParams(previous); next.set('environment', pending.environment); next.set('identity_id', pending.identity_id); next.delete('location_id'); next.delete('batch_id'); return next; })}>Open saved request’s account</button>}</div> : <>
        {pending.kind === 'import' ? <>
          <p className="text-sm">File SHA-256: {pending.file_sha256}. Only this fingerprint is saved; file contents are never stored in browser recovery data.</p>
          <button type="button" className={button} disabled={busy || !ready} onClick={() => void checkImport()}>Check saved import</button>
          {importMissing === pending.key && <p className="text-sm">Reselect the original file below. A matching fingerprint permits replay of this same request.</p>}
          {importMissing === pending.key && <button type="button" className={button} disabled={busy || !ready || file?.digest !== pending.file_sha256} onClick={() => void dispatch(pending)}>Replay original import</button>}
        </> : pending.kind === 'allocate' || pending.kind === 'review' ? <>
          <pre className="whitespace-pre-wrap font-sans text-sm">{JSON.stringify(pending.kind === 'allocate' ? { batch_id: pending.batch_id, deposit_id: pending.deposit_id, amount_cents: pending.amount_cents, reason: pending.reason } : { exception_id: pending.exception_id, reason: pending.reason }, null, 2)}</pre>
          <p className="text-sm">Checking replays this exact saved request with its original key. It does not create a replacement request.</p>
          <button type="button" className={button} disabled={busy || !ready} onClick={() => void dispatch(pending)}>Check / retry saved request</button>
        </> : null}
        {rejectedKey === pending.key && <div className="space-y-2"><p>The server durably rejected this exact request before an operation was created. Acknowledge the saved rejection to prepare corrected details.</p><button type="button" className={button} disabled={busy} onClick={() => { clearAccountingAction(pending); setSaved(readAccountingAction()); setRejectedKey(null); }}>Acknowledge validation rejection</button></div>}
      </>}
    </section>}
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-900">{notice}</p>}
    {result && <section className={card}><h2 className="font-semibold">Saved request result</h2><pre className="whitespace-pre-wrap font-sans text-sm">{JSON.stringify(result, null, 2)}</pre></section>}
    </div>
    {loading && <p role="status">{report ? 'Refreshing accounting report… Previous values are shown; changes are disabled until refresh completes.' : 'Loading accounting report…'}</p>}
    {loadError && <div role="alert" className={card}><p>Could not load the accounting report. {loadError} {report ? 'Previous values are shown; changes remain disabled until a successful refresh.' : ''}</p><button className={button} onClick={() => void reload()}>Retry report</button></div>}
    {!loading && !loadError && !report && datesValid && !forbiddenEnvironment && <p className={card}>No accounting account is available in this environment.</p>}
    {report && <>
      <section className={card} aria-labelledby={`${inputId}-totals`}>
        <h2 id={`${inputId}-totals`} className="text-lg font-semibold">{report.identity.provider} · {report.identity.account_id}</h2>
        <p className="text-sm">{report.from} through {report.to} · USD · Account #{report.identity.id}</p>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([
          ['Sales', report.totals.sales_cents], ['Returns', report.totals.returns_cents], ['Fees', report.totals.fees_cents], ['Adjustments', report.totals.adjustments_cents], ['Batch net', report.totals.batch_net_cents], ['Allocated to batches', report.totals.allocated_cents],
        ] as const).map(([label, amount]) => <div key={label}><dt className="text-sm text-gray-600">{label}</dt><dd className="text-lg font-semibold tabular-nums">{formatAccountingCents(amount)}</dd></div>)}<div><dt className="text-sm text-gray-600">Open exceptions</dt><dd className="text-lg font-semibold">{report.totals.open_exceptions}</dd></div></dl>
      </section>
      <section className={card} aria-labelledby={`${inputId}-imports`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={`${inputId}-imports`} className="text-lg font-semibold">Canonical CSV</h2><button type="button" className={button} disabled={!ready || busy} onClick={() => void exportCSV()}>Export account CSV</button></div>
        <p className="text-sm">This is the application’s canonical accounting format (tsq-reconciliation-v1), not an assigned bank format. Imports record observations; they do not move money. Exports cover the selected account, independently of report filters, and fail if over the server’s 1,000-record export limit.</p>
        <p className="text-sm font-semibold">Format to be confirmed with the bank</p>
        <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">Canonical file requirements</summary><p>Use UTF-8 CSV with schema_version tsq-reconciliation-v1 and the selected account_id, environment, and USD currency on every row. Include 1–1,000 records, using integer cents. The server validates exact header order and row context.</p><p className="mt-2 font-mono">schema_version,record_type,account_id,environment,currency,external_id,batch_id,deposit_id,transaction_id,original_reference,location_id,terminal_id,entry_type,amount_cents,sales_cents,returns_cents,fees_cents,adjustments_cents,occurred_at,provider_local_time,provider_offset,business_date,provider_batch_date,deposit_date,description</p></details>
        <Field label="Canonical CSV file (UTF-8, up to 1 MiB)"><input key={fileInputKey} type="file" accept=".csv,text/csv" className={control} disabled={busy || fileBusy || (!!pending && pending.kind !== 'import')} onChange={event => void chooseFile(event.target.files?.[0])} /></Field>
        {fileBusy && <p role="status">Checking file fingerprint…</p>}
        {file && <p className="text-sm">Selected file SHA-256: {file.digest}{pending?.kind === 'import' && file.digest !== pending.file_sha256 ? ' — Does not match the saved file.' : ''}</p>}
        <button type="button" className={primary} disabled={disabled || !file} onClick={() => file && void start({ kind: 'import', file_sha256: file.digest })}>Import canonical CSV</button>
        <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Saved import history ({report.imports.length} listed)</summary><Truncation truncated={report.truncated.imports} label="import history" />
        {!report.imports.length ? <p className="text-sm">No saved imports.</p> : <ul className="space-y-3">{report.imports.map(row => <li key={row.id} className="space-y-1 border-t border-gray-200 pt-3 text-sm"><p className="font-semibold">Import #{row.id} · {row.source} · {row.state}</p><p>Processed: {row.processed_at ?? 'Not processed'} · Key: {row.operation_key}</p><p>Payload digest: {row.payload_digest}</p><details><summary className="min-h-11 cursor-pointer py-2">Import summary</summary><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(row.summary, null, 2)}</pre></details></li>)}</ul>}</details>
      </section>
      <section className={card} aria-labelledby={`${inputId}-batches`}>
        <h2 id={`${inputId}-batches`} className="text-lg font-semibold">Settlement batches</h2><Truncation truncated={report.truncated.batches} label="batches" />
        {!report.batches.length ? <p>No batches match these filters.</p> : <ul className="grid gap-3 lg:grid-cols-2">{report.batches.map(batch => <li className={`min-w-0 space-y-3 rounded-lg border border-gray-200 p-4 ${batchId === batch.id ? 'lg:col-span-2' : ''}`} key={batch.id}><BatchFacts batch={batch} report={report} /><button id={`accounting-open-batch-${batch.id}`} type="button" className={button} aria-expanded={batchId === batch.id} aria-controls={batchId === batch.id ? `accounting-batch-${batch.id}` : undefined} onClick={() => setFilter('batch_id', String(batch.id))}>View batch #{batch.id} details</button>{batchId === batch.id && context && <BatchDetails key={`${context.identity_id}:${context.environment}:${batchId}`} batchId={batchId} context={context} report={report} getToken={getToken} refresh={refresh} onClose={() => { setFilter('batch_id', ''); document.getElementById(`accounting-open-batch-${batch.id}`)?.focus(); }} />}</li>)}</ul>}
      </section>
      {batchId && context && !report.batches.some(batch => batch.id === batchId) && <BatchDetails key={`${context.identity_id}:${context.environment}:${batchId}`} batchId={batchId} context={context} report={report} getToken={getToken} refresh={refresh} onClose={() => setFilter('batch_id', '')} />}
      <section className={card} aria-labelledby={`${inputId}-deposits`}>
        <h2 id={`${inputId}-deposits`} className="text-lg font-semibold">Funding deposits</h2><p className="text-sm text-gray-600">Full account-level deposit amounts and allocations can include batches outside your filters. Remaining balances retain their sign.</p><Truncation truncated={report.truncated.deposits} label="deposits" />
        {!report.deposits.length ? <p>No deposits are available for this selection.</p> : <ul className="grid gap-3 lg:grid-cols-2">{report.deposits.map(deposit => <li key={deposit.id} className="min-w-0 space-y-2 rounded-lg border border-gray-200 p-4 text-sm"><h3 className="font-semibold">{deposit.external_id} (#{deposit.id})</h3><p>Actual deposit date: {deposit.deposit_date}</p><p>Full amount: {formatAccountingCents(deposit.amount_cents)}</p><p>Allocated: {formatAccountingCents(deposit.allocated_cents)} · Remaining: {formatAccountingCents(deposit.remaining_cents)}</p></li>)}</ul>}
      </section>
      <section className={card} aria-labelledby={`${inputId}-allocate`}>
        <h2 id={`${inputId}-allocate`} className="text-lg font-semibold">Allocate a deposit to a batch</h2><p className="text-sm">Enter integer cents, including a minus sign for a negative allocation. A reason is required. Review both signed remaining balances before confirming.</p>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={prepareAllocation}>
          <Field label="Batch"><select required className={control} disabled={disabled} value={allocation.batch} onChange={event => { setConfirmation(null); setAllocation({ ...allocation, batch: event.target.value }); }}><option value="">Choose a batch</option>{report.batches.map(row => <option key={row.id} value={row.id}>#{row.id} · {row.external_id} · Remaining {formatAccountingCents(row.remaining_cents)}</option>)}</select></Field>
          <Field label="Deposit"><select required className={control} disabled={disabled} value={allocation.deposit} onChange={event => { setConfirmation(null); setAllocation({ ...allocation, deposit: event.target.value }); }}><option value="">Choose a deposit</option>{report.deposits.map(row => <option key={row.id} value={row.id}>#{row.id} · {row.external_id} · Remaining {formatAccountingCents(row.remaining_cents)}</option>)}</select></Field>
          <Field label="Signed amount (integer cents)"><input required type="text" inputMode="text" autoComplete="off" className={control} disabled={disabled} value={allocation.cents} onChange={event => { setConfirmation(null); setAllocation({ ...allocation, cents: event.target.value }); }} /></Field>
          <Field label="Allocation reason"><input required maxLength={240} className={control} disabled={disabled} value={allocation.reason} onChange={event => { setConfirmation(null); setAllocation({ ...allocation, reason: event.target.value }); }} /></Field>
          <div><button className={button} disabled={disabled || !report.batches.length || !report.deposits.length}>Review allocation</button></div>
        </form>
        {confirmation?.kind === 'allocate' && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Confirm allocation"><p>Allocate {formatAccountingCents(confirmation.amount_cents)} ({confirmation.amount_cents} cents) from deposit #{confirmation.deposit_id} to batch #{confirmation.batch_id}.</p><p>Batch remaining: {formatAccountingCents(report.batches.find(row => row.id === confirmation.batch_id)?.remaining_cents ?? NaN)} · Deposit remaining: {formatAccountingCents(report.deposits.find(row => row.id === confirmation.deposit_id)?.remaining_cents ?? NaN)}</p><p>Reason: {confirmation.reason}</p><div className="flex flex-wrap gap-3"><button type="button" className={primary} disabled={disabled} onClick={() => void start(confirmation)}>Confirm allocation</button><button type="button" className={button} onClick={() => setConfirmation(null)}>Cancel</button></div></div>}
      </section>
      <section className={card} aria-labelledby={`${inputId}-exceptions`}>
        <h2 id={`${inputId}-exceptions`} className="text-lg font-semibold">Reconciliation exceptions</h2><p className="text-sm">Review acknowledges evidence. It does not erase a variance, correct source records, pay, refund, or restock anything.</p><Truncation truncated={report.truncated.exceptions} label="exceptions" />
        {!report.exceptions.length ? <p>No exceptions are recorded for this selection.</p> : <ul className="space-y-4">{report.exceptions.map(row => <li key={row.id} className="space-y-2 border-t border-gray-200 pt-4 text-sm"><h3 className="font-semibold">#{row.id} · {row.category} · {row.state}</h3><p>Batch: {row.settlement_batch_id ?? 'None'} · Deposit: {row.funding_deposit_id ?? 'None'}</p><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(row.facts, null, 2)}</pre>{row.state === 'reviewed' ? <p>Reviewed: {row.reviewed_at ?? 'Time unavailable'} · Reason: {row.review_reason ?? 'Unavailable'}</p> : <ReviewException disabled={disabled} onReview={reason => void start({ kind: 'review', exception_id: row.id, reason })} />}</li>)}</ul>}
      </section>
      {import.meta.env.DEV && canSimulate && environment === 'simulated' && SimulatedReconciliationPanel && context && <Suspense fallback={<p role="status">Loading account tools…</p>}><SimulatedReconciliationPanel report={report} context={context} getToken={getToken} disabled={disabled} busy={busy || loading || !!loadError} pending={matches ? pending : null} onStart={start} onRetry={dispatch} /></Suspense>}
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="block min-w-0 space-y-1 text-sm font-medium"><label htmlFor={id} className="block">{label}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}
function Truncation({ truncated, label }: { truncated: boolean; label: string }) { return truncated ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Only the first 100 {label} are listed. This listing is incomplete; totals may cover more records. Narrow filters where applicable. Account export has a separate server limit.</p> : null; }
function BatchFacts({ batch, report }: { batch: AccountingBatch; report: AccountingReport }) {
  return <div className="space-y-1 text-sm"><h3 className="font-semibold">{batch.external_id} (#{batch.id})</h3><p>Location: {report.locations.find(row => row.id === batch.location_id)?.name ?? batch.location_id ?? 'Not supplied'} · Terminal: {batch.terminal_id ?? 'Not supplied'}</p><p>Guam business date: {batch.business_date}</p><p>Original provider batch date: {batch.provider_batch_date ?? 'Not supplied'}</p><p>Closed at: {batch.closed_at ?? 'Not supplied'}</p><p>Sales: {formatAccountingCents(batch.sales_cents)} · Returns: {formatAccountingCents(batch.returns_cents)}</p><p>Fees: {formatAccountingCents(batch.fees_cents)} · Adjustments: {formatAccountingCents(batch.adjustments_cents)}</p><p className="font-semibold">Net: {formatAccountingCents(batch.amount_cents)}</p><p>Allocated: {formatAccountingCents(batch.allocated_cents)} · Remaining: {formatAccountingCents(batch.remaining_cents)}</p></div>;
}
function BatchDetails({ batchId, context, report, getToken, refresh, onClose }: { batchId: string; context: AccountingContext; report: AccountingReport; getToken: GetTokenFn; refresh: number; onClose: () => void }) {
  const [response, setResponse] = useState<{ key: string; data: BatchDetail | null; error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const { identity_id, environment } = context;
  const requestKey = JSON.stringify({ batchId, identity_id, environment, retry, refresh });
  const loading = response?.key !== requestKey;
  const data = response?.key === requestKey ? response.data : null;
  const error = response?.key === requestKey ? response.error : '';
  useEffect(() => {
    const abort = new AbortController();
    void getAccountingBatch(batchId, { identity_id, environment }, getToken, abort.signal).then(value => {
      if (!abort.signal.aborted) {
        if (value.batch.id !== batchId) throw new Error('Batch response did not match.');
        setResponse({ key: requestKey, data: value, error: '' });
      }
    }).catch(cause => { if (!abort.signal.aborted) setResponse({ key: requestKey, data: null, error: message(cause) }); });
    return () => abort.abort();
  }, [batchId, identity_id, environment, getToken, requestKey]);
  return <section id={`accounting-batch-${batchId}`} className={card} aria-label={`Batch ${batchId} details`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Batch #{batchId} details</h2><button className={button} onClick={onClose}>Close details · keep filters</button></div>
    {loading ? <p role="status">Loading batch details…</p> : error ? <div role="alert"><p>{error}</p><button className={button} onClick={() => setRetry(value => value + 1)}>Retry details</button></div> : data && <>
      <BatchFacts batch={data.batch} report={report} />
      {data.truncated && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3">Batch details are incomplete. Items and allocations are each limited to 1,000 records.</p>}
      <h3 className="font-semibold">Settlement items</h3>
      {!data.items.length ? <p>No settlement items are recorded.</p> : <ul className="grid gap-3 lg:grid-cols-2">{data.items.map(item => <li key={item.id} className="min-w-0 space-y-1 rounded-lg border border-gray-200 p-3 text-sm"><p className="font-semibold">{item.entry_type} · {formatAccountingCents(item.amount_cents)} · {item.external_id}</p><p>Transaction: {item.transaction_id ?? 'Not supplied'}</p><p>Original reference: {item.original_reference ?? 'Not supplied'}</p><p>Occurred at (original timestamp): {item.occurred_at ?? 'Not supplied'}</p><p>Original provider local time: {item.provider_local_time ?? 'Not supplied'} · Provider offset: {item.provider_offset ?? 'Not supplied'}</p><p>Guam business date: {item.business_date ?? 'Not supplied'}</p><p>Location: {item.location_id ?? 'Not supplied'} · Terminal: {item.terminal_id ?? 'Not supplied'}</p></li>)}</ul>}
      <h3 className="font-semibold">Funding allocations</h3>
      {!data.allocations.length ? <p>No funding allocations are recorded.</p> : <ul className="space-y-2">{data.allocations.map(row => <li key={row.id} className="rounded-lg border border-gray-200 p-3 text-sm"><p>{row.external_id} · {formatAccountingCents(row.amount_cents)} · Deposit #{row.funding_deposit_id}</p><p>Actual deposit date: {report.deposits.find(deposit => deposit.id === row.funding_deposit_id)?.deposit_date ?? 'Not in this deposit listing; do not infer a date'}</p><p>Reason: {row.reason ?? 'Not supplied'}</p></li>)}</ul>}
    </>}
  </section>;
}
function ReviewException({ disabled, onReview }: { disabled: boolean; onReview: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (reason.trim()) onReview(reason.trim()); }}><div className="min-w-0 grow"><Field label="Evidence review reason"><input required maxLength={240} disabled={disabled} className={control} value={reason} onChange={event => setReason(event.target.value)} /></Field></div><button className={button} disabled={disabled || !reason.trim()}>Acknowledge evidence as reviewed</button></form>;
}
