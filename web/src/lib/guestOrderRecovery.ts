// Device links are a convenience; the server still validates the capability.
export function rememberOrderCapability(orderId: number, capability: string, guest: boolean) {
  if (!capability) return;
  localStorage.setItem(`tsq-order-capability:${orderId}`, capability);
  if (guest) localStorage.setItem(`tsq-guest-order:${orderId}`, '1');
  else localStorage.removeItem(`tsq-guest-order:${orderId}`);
}

export function savedGuestOrderIds(): string[] {
  try {
    return Object.keys(localStorage).filter(key => /^tsq-guest-order:\d+$/.test(key))
      .map(key => key.split(':')[1])
      .filter(id => localStorage.getItem(`tsq-guest-order:${id}`) === '1' && !!localStorage.getItem(`tsq-order-capability:${id}`));
  } catch { return []; }
}
