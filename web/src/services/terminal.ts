import { authDelete, authGet, authPatch, authPost } from './authApi';
import type { PaymentEnvironment, PaymentProvider, PaymentReceiptFacts } from '../types/paymentReceipt';

// Compatibility facade only: these functions are used explicitly by the Stripe path.
export * from './stripeTerminal';

export interface PaymentTerminal {
  id: number;
  label: string;
  location_id: number;
  lane_id: string;
  terminal_id: string;
  payment_profile_id: number | null;
  enabled: boolean;
  collectable?: boolean;
  environment: PaymentEnvironment;
  provider: PaymentProvider;
  connection_state: string;
  connection_verified_at: string | null;
  device_serial: string | null;
  device_model: string | null;
  device_firmware: string | null;
  status: 'ready' | 'waiting_for_card' | 'card_inserted' | 'processing' | 'offline' | 'retired';
  collection_ready?: boolean;
  attempt_id: string | null;
  order_number?: string | null;
  receipt?: PaymentReceiptFacts | null;
}

export interface TerminalProfile {
  id: number;
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  location_id: number | null;
  presentation: string;
}
export interface TerminalsResponse { terminals: PaymentTerminal[]; profiles?: TerminalProfile[] }
export type AdministrationState = 'reserved' | 'dispatching' | 'unknown' | 'succeeded' | 'failed';
export interface TerminalAdministrationResponse {
  administration: { id: string; state: AdministrationState; kind: string; error: string | null };
  terminal: PaymentTerminal | null;
}
export interface NewTerminalPayload {
  payment_profile_id: number;
  location_id: number;
  lane_id: string;
  terminal_id: string;
  label: string;
}
export interface TerminalPaymentResponse {
  id?: number;
  order_id?: number;
  order_number?: string;
  payment_attempt_id?: string;
  payment_state?: string;
  payment_status?: string;
  payment_environment?: PaymentEnvironment;
  payment_provider?: PaymentProvider;
  payment_terminal_id?: number;
  inventory_committed?: boolean;
  checkout_session_id?: string;
  payment_receipt?: PaymentReceiptFacts | null;
  terminal_resume?: { provider_state?: string; client_secret?: string };
  pending?: boolean;
}
type Auth = { token: string };
type AdministrationAuth = Auth & { key: string };
const base = '/admin/payment_terminals';
const requestConfig = { timeout: 20000 };
const keyed = (key: string) => ({ ...requestConfig, headers: { 'Idempotency-Key': key } });

export async function getTerminals({ token, signal }: Auth & { signal?: AbortSignal }): Promise<TerminalsResponse> {
  return (await authGet<TerminalsResponse>(base, async () => token, { ...requestConfig, signal })).data;
}

/** The caller must supply the ORIGINAL POS request key, including on retries. */
export async function startTerminalPayment({ orderId, terminalId, key, token }: AdministrationAuth & { orderId: number; terminalId: number }): Promise<TerminalPaymentResponse> {
  return (await authPost<TerminalPaymentResponse>(`/admin/pos/orders/${orderId}/payments`,
    { payment_terminal_id: terminalId }, async () => token, keyed(key))).data;
}

export async function collectTerminal({ terminalId, attemptId, token }: Auth & { terminalId: number; attemptId: string }): Promise<PaymentTerminal> {
  return (await authPost<PaymentTerminal>(`${base}/${terminalId}/collect`, { attempt_id: attemptId }, async () => token, requestConfig)).data;
}
export async function checkTerminal({ terminalId, token }: Auth & { terminalId: number }): Promise<PaymentTerminal> {
  return (await authGet<PaymentTerminal>(`${base}/${terminalId}/status`, async () => token, requestConfig)).data;
}
export async function cancelTerminal({ terminalId, attemptId, token }: Auth & { terminalId: number; attemptId: string }): Promise<PaymentTerminal> {
  return (await authPost<PaymentTerminal>(`${base}/${terminalId}/cancel`, { attempt_id: attemptId }, async () => token, requestConfig)).data;
}

/** Omit activationCode when checking a saved request whose dispatch is uncertain. */
export async function createPaymentTerminal({ payload, activationCode, key, token }: AdministrationAuth & { payload: NewTerminalPayload; activationCode?: string }): Promise<TerminalAdministrationResponse> {
  return (await authPost<TerminalAdministrationResponse>(base,
    { ...payload, ...(activationCode ? { activation_code: activationCode } : {}) }, async () => token, keyed(key))).data;
}
export async function pairPaymentTerminal({ terminalId, activationCode, key, token }: AdministrationAuth & { terminalId: number; activationCode?: string }): Promise<TerminalAdministrationResponse> {
  return (await authPost<TerminalAdministrationResponse>(`${base}/${terminalId}/pair`,
    activationCode ? { activation_code: activationCode } : {}, async () => token, keyed(key))).data;
}
export async function retirePaymentTerminal({ terminalId, key, token }: AdministrationAuth & { terminalId: number }): Promise<TerminalAdministrationResponse> {
  return (await authDelete<TerminalAdministrationResponse>(`${base}/${terminalId}`, async () => token, keyed(key))).data;
}
export async function updatePaymentTerminal({ terminalId, label, enabled, token }: Auth & { terminalId: number; label: string; enabled: boolean }): Promise<PaymentTerminal> {
  return (await authPatch<PaymentTerminal>(`${base}/${terminalId}`, { label, enabled }, async () => token, requestConfig)).data;
}
