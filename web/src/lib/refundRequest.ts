export interface RefundPayload { amount_cents: number; reason: string; restock_items: boolean }
export interface SavedRefundRequest { key: string; owner: string; orderId: number; operationId?: string; payload: RefundPayload }
const storageKey = (orderId: number) => `tsq-refund-request:${orderId}`;
export function savedRefundRequest(orderId: number, storage = localStorage): SavedRefundRequest | null {
  try { return JSON.parse(storage.getItem(storageKey(orderId)) || 'null'); } catch { return null; }
}
export function prepareRefundRequest(orderId: number, owner: string | null | undefined, payload: RefundPayload, storage = localStorage): SavedRefundRequest {
  if (!owner) throw new Error('Sign in before checking a saved refund.');
  const saved = savedRefundRequest(orderId, storage);
  if (saved) {
    if (saved.owner !== owner) throw new Error('This saved refund belongs to another staff session. Administrator reconciliation is required.');
    if (JSON.stringify(saved.payload) !== JSON.stringify(payload)) throw new Error('Check the saved refund before changing its amount or stock decision.');
    return saved;
  }
  const request = { key: crypto.randomUUID(), owner, orderId, payload };
  storage.setItem(storageKey(orderId), JSON.stringify(request));
  return request;
}
export function rememberRefundOperation(request: SavedRefundRequest, operationId: string, storage = localStorage) {
  const current = savedRefundRequest(request.orderId, storage);
  if (current?.key === request.key && current.owner === request.owner) storage.setItem(storageKey(request.orderId), JSON.stringify({ ...current, operationId }));
}
export function clearRefundRequest(orderId: number, requestKey: string, storage = localStorage) {
  if (savedRefundRequest(orderId, storage)?.key === requestKey) storage.removeItem(storageKey(orderId));
}
