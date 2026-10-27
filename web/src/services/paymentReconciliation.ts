import type { GetTokenFn } from './authApi';
import type { PaymentEnvironment } from '../types/paymentReceipt';

export interface AccountingIdentity { id: string; provider: string; environment: PaymentEnvironment; account_id: string; currency: string }
export interface AccountingContext { identity_id: string; environment: PaymentEnvironment }
export interface AccountingBatch {
  id: string; external_id: string; location_id: number | null; terminal_id: string | null;
  business_date: string; provider_batch_date: string | null; closed_at: string | null;
  sales_cents: number; returns_cents: number; fees_cents: number; adjustments_cents: number;
  amount_cents: number; allocated_cents: number; remaining_cents: number;
}
export interface AccountingDeposit { id: string; external_id: string; deposit_date: string; amount_cents: number; allocated_cents: number; remaining_cents: number }
export interface AccountingException { id: string; category: string; state: string; facts: unknown; settlement_batch_id: string | null; funding_deposit_id: string | null; review_reason: string | null; reviewed_at: string | null }
export interface AccountingImport { id: string; operation_key: string; payload_digest: string; source: string; state: string; summary: unknown; processed_at: string | null }
export interface VoidableAttempt { attempt_id: string; order_number: string; amount_cents: number }
export interface AccountingReport {
  identity: AccountingIdentity; from: string; to: string; accounting_time: string | null;
  locations: { id: number; name: string }[]; voidable_attempts: VoidableAttempt[];
  totals: { sales_cents: number; returns_cents: number; fees_cents: number; adjustments_cents: number; batch_net_cents: number; allocated_cents: number; open_exceptions: number };
  batches: AccountingBatch[]; deposits: AccountingDeposit[]; exceptions: AccountingException[]; imports: AccountingImport[];
  truncated: { batches: boolean; deposits: boolean; exceptions: boolean; imports: boolean };
}
export interface AccountingIndex { accounts: AccountingIdentity[]; report: AccountingReport | null }
export interface BatchDetail {
  batch: AccountingBatch;
  items: { id: string; external_id: string; entry_type: string; amount_cents: number; transaction_id: string | null; original_reference: string | null; occurred_at: string | null; provider_local_time: string | null; provider_offset: string | null; business_date: string | null; location_id: number | null; terminal_id: string | null }[];
  allocations: { id: string; external_id: string; funding_deposit_id: string; amount_cents: number; reason: string | null }[];
  truncated: boolean;
}
export type AccountingFilters = { environment: PaymentEnvironment; identity_id?: string; from?: string; to?: string; location_id?: number };
const base = '/admin/payment_reconciliation';

// Use the shared API client (Bearer authentication, device headers and auth-error handling).
// Lazy resolution also lets the pure recovery helpers run without a browser or API configuration.
export async function accountingGet<T>(path: string, params: object, getToken: GetTokenFn, signal?: AbortSignal): Promise<T> {
  const { authGet } = await import('./authApi');
  return (await authGet<T>(`${base}${path}`, getToken, { params, signal, timeout: 20000 })).data;
}
export const getAccountingReport = (filters: AccountingFilters, getToken: GetTokenFn, signal?: AbortSignal) => accountingGet<AccountingIndex>('', filters, getToken, signal);
export const getAccountingBatch = (id: string, context: AccountingContext, getToken: GetTokenFn, signal?: AbortSignal) => accountingGet<BatchDetail>(`/batches/${id}`, context, getToken, signal);
export const checkAccountingImport = (context: AccountingContext, key: string, getToken: GetTokenFn) => accountingGet<AccountingImport>('/import_status', { ...context, operation_key: key }, getToken);

export async function downloadAccountingCSV(path: '/export' | '/simulated_funding', params: object, getToken: GetTokenFn, filename: string): Promise<void> {
  const { authGet } = await import('./authApi');
  try {
    const response = await authGet<Blob>(`${base}${path}`, getToken, { params, timeout: 20000, responseType: 'blob' });
    if (response.data.type.includes('json')) throw new Error('The server returned an error instead of CSV.');
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    // Give the browser a task to consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (response?.data instanceof Blob) {
      try { response.data = JSON.parse(await response.data.text()); } catch { /* Keep the HTTP error if the body is not JSON. */ }
    }
    throw error;
  }
}

/** No floating-point division of cents: every accepted safe integer formats exactly. */
export function formatAccountingCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) return 'Amount unavailable';
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '−' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function parseSignedCents(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents !== 0 ? cents : null;
}
export function defaultAccountingDates(now = new Date()): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Guam', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
  const to = `${part('year')}-${part('month')}-${part('day')}`;
  const first = new Date(`${to}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 29);
  return { from: first.toISOString().slice(0, 10), to };
}
export function validAccountingDates(from: string, to: string): boolean {
  const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  return date(from) && date(to) && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 <= 365;
}
export const MAX_ACCOUNTING_FILE_BYTES = 1024 * 1024;
export async function accountingFileDigest(bytes: ArrayBuffer): Promise<string> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ACCOUNTING_FILE_BYTES) throw new Error('Choose a nonempty CSV file up to 1 MiB.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export type AccountingAction =
  | { kind: 'import'; file_sha256: string }
  | { kind: 'allocate'; batch_id: string; deposit_id: string; amount_cents: number; reason: string }
  | { kind: 'review'; exception_id: string; reason: string }
  | { kind: 'simulate_close'; scenario: string; lag_days: number; fee_cents: number }
  | { kind: 'advance_simulation'; seconds: number }
  | { kind: 'simulate_void'; attempt_id: string; order_number: string; amount_cents: number };
export type PendingAccountingAction = AccountingAction & AccountingContext & { version: 1; actor_id: number; key: string };
export type SavedAccountingAction = { pending: PendingAccountingAction | null; blocked: boolean };
export interface AccountingStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const accountingStorageKey = 'tsq-pending-accounting-v1';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const reason = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 240 && !/[\p{Cc}]/u.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);

/** Strict, nonsecret allowlist. A corrupt or unknown saved request blocks new mutations. */
export function readAccountingAction(storage?: AccountingStorage): SavedAccountingAction {
  try {
    const raw = (storage ?? localStorage).getItem(accountingStorageKey);
    if (!raw) return { pending: null, blocked: false };
    const v: unknown = JSON.parse(raw);
    if (!record(v) || v.version !== 1 || !positive(v.actor_id) || !uuid(v.identity_id) || !uuid(v.key) || !['production', 'sandbox', 'simulated'].includes(String(v.environment))) throw new Error('Invalid context');
    let action: AccountingAction;
    if (v.kind === 'import' && typeof v.file_sha256 === 'string' && /^[a-f\d]{64}$/.test(v.file_sha256)) action = { kind: v.kind, file_sha256: v.file_sha256 };
    else if (v.kind === 'allocate' && uuid(v.batch_id) && uuid(v.deposit_id) && Number.isSafeInteger(v.amount_cents) && v.amount_cents !== 0 && reason(v.reason)) action = { kind: v.kind, batch_id: v.batch_id, deposit_id: v.deposit_id, amount_cents: v.amount_cents as number, reason: v.reason };
    else if (v.kind === 'review' && uuid(v.exception_id) && reason(v.reason)) action = { kind: v.kind, exception_id: v.exception_id, reason: v.reason };
    else if (v.kind === 'simulate_close' && ['ordinary', 'combined', 'split', 'weekend', 'missing', 'duplicate', 'mismatch', 'external_refund'].includes(String(v.scenario)) && integer(v.lag_days, 0, 14) && integer(v.fee_cents, 0, 10000)) action = { kind: v.kind, scenario: v.scenario as string, lag_days: v.lag_days as number, fee_cents: v.fee_cents as number };
    else if (v.kind === 'advance_simulation' && integer(v.seconds, 1, 2678400)) action = { kind: v.kind, seconds: v.seconds as number };
    else if (v.kind === 'simulate_void' && uuid(v.attempt_id) && typeof v.order_number === 'string' && v.order_number.length > 0 && v.order_number.length <= 200 && integer(v.amount_cents, 1, Number.MAX_SAFE_INTEGER)) action = { kind: v.kind, attempt_id: v.attempt_id, order_number: v.order_number, amount_cents: v.amount_cents as number };
    else throw new Error('Invalid action');
    const pending: PendingAccountingAction = { ...action, version: 1, actor_id: v.actor_id, identity_id: v.identity_id, environment: v.environment as PaymentEnvironment, key: v.key };
    if (Object.keys(v).sort().join(',') !== Object.keys(pending).sort().join(',')) throw new Error('Unexpected saved fields');
    if (['simulate_close', 'advance_simulation', 'simulate_void'].includes(pending.kind) && pending.environment !== 'simulated') throw new Error('Invalid environment');
    return { pending, blocked: false };
  } catch { return { pending: null, blocked: true }; }
}
export function sameAccountingContext(pending: PendingAccountingAction, actorId: number, context: AccountingContext): boolean {
  return pending.actor_id === actorId && pending.identity_id === context.identity_id && pending.environment === context.environment;
}
export function prepareAccountingAction(action: AccountingAction, actorId: number, context: AccountingContext, storage: AccountingStorage = localStorage): PendingAccountingAction {
  const saved = readAccountingAction(storage);
  if (saved.blocked || saved.pending) throw new Error('Resolve the saved accounting request before starting another.');
  const pending: PendingAccountingAction = { ...action, ...context, actor_id: actorId, key: crypto.randomUUID(), version: 1 };
  // Validate the exact allowlisted shape before persisting; never include file contents.
  const raw = JSON.stringify(pending);
  const candidate = readAccountingAction({ getItem: () => raw, setItem: () => {}, removeItem: () => {} });
  if (!candidate.pending || candidate.blocked) throw new Error('Invalid accounting request.');
  storage.setItem(accountingStorageKey, raw);
  if (storage.getItem(accountingStorageKey) !== raw) throw new Error('Could not save the original accounting request.');
  return pending;
}
export function assertSavedAccountingAction(pending: PendingAccountingAction, actorId: number, context: AccountingContext, storage: AccountingStorage = localStorage): void {
  const saved = readAccountingAction(storage);
  if (!sameAccountingContext(pending, actorId, context) || saved.blocked || !saved.pending || JSON.stringify(Object.entries(saved.pending).sort()) !== JSON.stringify(Object.entries(pending).sort())) throw new Error('The saved request or signed-in account changed. Return to its original account.');
}
export function clearAccountingAction(pending: PendingAccountingAction, storage: AccountingStorage = localStorage): void {
  const saved = readAccountingAction(storage);
  if (!saved.blocked && saved.pending?.key === pending.key && saved.pending.actor_id === pending.actor_id) storage.removeItem(accountingStorageKey);
}
export async function dispatchAccountingAction(pending: PendingAccountingAction, getToken: GetTokenFn, csv?: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const { authPost } = await import('./authApi');
  const context = { identity_id: pending.identity_id, environment: pending.environment };
  let path: string = `/${pending.kind}`;
  let payload: object;
  switch (pending.kind) {
    case 'import':
      if (!csv) throw new Error('Reselect the original CSV before retrying.');
      payload = { ...context, csv }; break;
    case 'allocate': payload = { ...context, batch_id: pending.batch_id, deposit_id: pending.deposit_id, amount_cents: pending.amount_cents, reason: pending.reason }; break;
    case 'review': path = `/exceptions/${pending.exception_id}/review`; payload = { ...context, reason: pending.reason }; break;
    case 'simulate_close': payload = { ...context, scenario: pending.scenario, lag_days: pending.lag_days, fee_cents: pending.fee_cents }; break;
    case 'advance_simulation': payload = { ...context, seconds: pending.seconds }; break;
    case 'simulate_void': payload = { ...context, attempt_id: pending.attempt_id }; break;
  }
  const response = await authPost<Record<string, unknown>>(`${base}${path}`, payload, getToken, { timeout: 20000, headers: { 'Idempotency-Key': pending.key } });
  return { status: response.status, data: response.data };
}
/** A transport success alone never releases an uncertain or mismatched saved request. */
export function confirmedAccountingResult(operation: PendingAccountingAction, response: { status: number; data: Record<string, unknown> }): boolean {
  const { status, data } = response;
  if (status !== 200 || data.pending === true || data.status === 'unknown') return false;
  switch (operation.kind) {
    case 'import': return uuid(data.id) && data.operation_key === operation.key && data.payload_digest === operation.file_sha256 && ['succeeded', 'conflicted'].includes(String(data.state));
    case 'allocate': return uuid(data.id) && data.amount_cents === operation.amount_cents;
    case 'review': return data.id === operation.exception_id && data.state === 'reviewed' && data.review_reason === operation.reason;
    case 'simulate_close': return uuid(data.id) && data.operation_key === operation.key && ['succeeded', 'conflicted'].includes(String(data.state));
    case 'advance_simulation': return typeof data.accounting_time === 'string' && Number.isFinite(Date.parse(data.accounting_time));
    case 'simulate_void': return typeof data.success === 'boolean' && ((data.success && data.status === 'succeeded') || (!data.success && data.status === 'failed'));
  }
}
export function accountingErrorStatus(error: unknown): number | undefined { return (error as { response?: { status?: number } })?.response?.status; }
export function accountingErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  return error instanceof Error ? error.message : 'The accounting request could not be confirmed.';
}
