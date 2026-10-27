// Confirmed B&G Pacific contact details in the project README.
export const STORE_ADDRESS = '416 Chalan San Antonio, Tamuning, GU 96913';
export const STORE_WHATSAPP = '(671) 864-6656';
export const STORE_WHATSAPP_URL = 'https://wa.me/16718646656';

export function getStorePhone(configured?: string) {
  const phone = configured?.trim();
  const digits = phone?.replace(/\D/g, '');
  // Older settings can still contain the inherited demo number.
  return !phone || digits === '6717771234' || digits === '16717771234'
    ? '(671) 646-2652'
    : phone;
}

export function getStorePhoneTel(phone: string) {
  const dial = phone.trim().replace(/[().\s-]/g, '');
  if (/^\d{7}$/.test(dial)) return `tel:+1671${dial}`;
  if (/^\d{10}$/.test(dial)) return `tel:+1${dial}`;
  if (/^1\d{10}$/.test(dial)) return `tel:+${dial}`;
  // Keep explicit international or other dial strings in their configured form.
  return `tel:${dial}`;
}
