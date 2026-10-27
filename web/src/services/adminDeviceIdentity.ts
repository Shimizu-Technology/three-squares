const ADMIN_DEVICE_STORAGE_KEY = 'ts-admin-device-id';
let sessionDeviceId: string | null = null;

function fallbackUuid() {
  return `ts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAdminDeviceId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const existing = window.localStorage.getItem(ADMIN_DEVICE_STORAGE_KEY);
    if (existing && existing.length <= 128) return existing;
  } catch { /* Restricted storage: keep a stable identity for this page session. */ }
  if (sessionDeviceId) return sessionDeviceId;

  const nextValue =
    typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : fallbackUuid();

  sessionDeviceId = nextValue;
  try { window.localStorage.setItem(ADMIN_DEVICE_STORAGE_KEY, nextValue); }
  catch { /* Authenticated requests must still work when storage is unavailable. */ }
  return nextValue;
}

export function getAdminDeviceHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const deviceId = getAdminDeviceId();
  return deviceId
    ? {
        ...headers,
        'X-Admin-Device-Id': deviceId,
      }
    : headers;
}

export function detectBrowserMetadata() {
  if (typeof navigator === 'undefined') {
    return {
      platform: '',
      browser: '',
      userAgent: '',
    };
  }

  const userAgent = navigator.userAgent || '';
  let browser = 'Browser';

  if (/Edg\//.test(userAgent)) browser = 'Edge';
  else if (/Chrome\//.test(userAgent)) browser = 'Chrome';
  else if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) browser = 'Safari';
  else if (/Firefox\//.test(userAgent)) browser = 'Firefox';

  return {
    platform: navigator.platform || 'Unknown',
    browser,
    userAgent,
  };
}
