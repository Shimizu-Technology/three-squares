import api from './api';
import { rememberOrderCapability } from '../lib/guestOrderRecovery';

export interface CheckoutState {
  id: string;
  attempt_id: string;
  payment_identity_id: string;
  state: string;
  payment_state: string;
  amount_cents: number;
  currency: string;
  provider: 'stripe' | 'worldpay';
  environment: 'simulated' | 'sandbox' | 'production';
  flow: 'stripe_embedded' | 'worldpay_hosted_fields' | 'worldpay_hosted_page' | 'simulated_fields' | null;
  collection_config: { client_secret?: string; payment_environment?: string; payment_identity_id?: string; stripe_account_id?: string; stripe_publishable_key?: string };
  order: { id: number; order_number: string; payment_status: string; inventory_committed: boolean };
}

export function checkoutClientConfiguration(state: CheckoutState) {
  return { ...state.collection_config, payment_identity_id: state.payment_identity_id || state.collection_config.payment_identity_id, payment_environment: state.environment, payment_processor: state.provider };
}

const STORAGE_KEY = 'tsq-checkout-pending';
interface PendingCheckout { id: string; capability: string; key: string; orderId: number; amountCents?: number; orderNumber?: string }
export function pendingCheckout(): PendingCheckout | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
export function saveCheckout(state: CheckoutState, capability: string, key: string, guest: boolean) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: state.id, capability, key, orderId: state.order.id, amountCents: state.amount_cents, orderNumber: state.order.order_number }));
  rememberOrderCapability(state.order.id, capability, guest);
}
export function clearPendingCheckout() { sessionStorage.removeItem(STORAGE_KEY); }
export function checkoutCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
function headers(token: string | null, capability: string, cartSession?: string | null, key?: string) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Checkout-Capability': capability, ...(cartSession ? { 'X-Session-ID': cartSession } : {}), ...(key ? { 'Idempotency-Key': key } : {}) };
}
export const checkoutApi = {
  advanceSimulation: async (id: string, token: string | null, capability: string) =>
    (await api.post<CheckoutState>(`/checkout_sessions/${id}/advance_simulation`, { seconds: 61 }, { headers: headers(token, capability) })).data,
  simulate: async (id: string, token: string | null, capability: string, handle: string, scenario: string, mode: string) =>
    (await api.post<CheckoutState>(`/checkout_sessions/${id}/simulate`, { handle, scenario, mode }, { headers: headers(token, capability) })).data,
  cancel: async (id: string, token: string | null, capability: string) =>
    (await api.post<CheckoutState>(`/checkout_sessions/${id}/cancel`, {}, { headers: headers(token, capability) })).data,
  create: async (order: object, token: string | null, capability: string, key: string, cartSession: string | null) =>
    (await api.post<CheckoutState>('/checkout_sessions', { order }, { headers: headers(token, capability, cartSession, key) })).data,
  confirm: async (id: string, token: string | null, capability: string) =>
    (await api.post<CheckoutState>(`/checkout_sessions/${id}/confirm`, {}, { headers: headers(token, capability) })).data,
  show: async (id: string, token: string | null, capability: string) =>
    (await api.get<CheckoutState>(`/checkout_sessions/${id}`, { headers: headers(token, capability) })).data,
};
