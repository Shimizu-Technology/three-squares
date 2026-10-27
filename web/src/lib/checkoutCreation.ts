export interface PendingCreation {
  key: string;
  capability: string;
  cartSession: string | null;
  owner: string;
  order: object;
  expires: number;
}
const key = 'tsq-checkout-creation';
export function readPendingCreation(storage: Storage = sessionStorage): PendingCreation | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    // Age never authorizes forgetting a possibly dispatched payment. Only a
    // recovered server response or definite rejection clears this request.
    if (!value || !Number.isFinite(value.expires) || !/^[a-f0-9]{64}$/.test(value.capability) ||
        typeof value.key !== 'string' || typeof value.owner !== 'string' || !value.order || typeof value.order !== 'object') return null;
    return value;
  } catch { return null; }
}
export function savePendingCreation(value: Omit<PendingCreation, 'expires'>, storage: Storage = sessionStorage) {
  storage.setItem(key, JSON.stringify({ ...value, expires: Date.now() + 30 * 60 * 1000 }));
}
export function clearPendingCreation(storage: Storage = sessionStorage) { storage.removeItem(key); }
