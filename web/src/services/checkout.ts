import api from './api';

export interface CheckoutState {
  id: string;
  attempt_id: string;
  state: string;
  payment_state: string;
  amount_cents: number;
  currency: string;
  provider: 'stripe' | 'worldpay';
  environment: 'simulated' | 'sandbox' | 'production';
  flow: 'stripe_embedded' | 'worldpay_hosted_fields' | 'worldpay_hosted_page' | null;
  collection_config: { client_secret?: string };
  order: { id: number; order_number: string; payment_status: string; inventory_committed: boolean };
}

const STORAGE_KEY = 'tsq-checkout-pending';
interface PendingCheckout { id: string; capability: string; key: string; orderId: number }
export function pendingCheckout(): PendingCheckout | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
export function saveCheckout(state: CheckoutState, capability: string, key: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: state.id, capability, key, orderId: state.order.id }));
  if (capability) localStorage.setItem(`tsq-order-capability:${state.order.id}`, capability);
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
  create: async (order: object, token: string | null, capability: string, key: string, cartSession: string | null) =>
    (await api.post<CheckoutState>('/checkout_sessions', { order }, { headers: headers(token, capability, cartSession, key) })).data,
  confirm: async (id: string, token: string | null, capability: string) =>
    (await api.post<CheckoutState>(`/checkout_sessions/${id}/confirm`, {}, { headers: headers(token, capability) })).data,
  show: async (id: string, token: string | null, capability: string) =>
    (await api.get<CheckoutState>(`/checkout_sessions/${id}`, { headers: headers(token, capability) })).data,
};
