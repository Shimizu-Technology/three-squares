import { authDelete, authGet, authPost } from './authApi';
import type { GetTokenFn } from './authApi';

export interface AdminDeviceRecord {
  id: number | null;
  device_uuid: string;
  name: string;
  location_id?: number | null;
  location_name?: string | null;
  user_id?: number | null;
  user_email?: string | null;
  platform?: string | null;
  browser?: string | null;
  active: boolean;
  location_locked?: boolean;
  last_seen_at?: string | null;
  push_enabled: boolean;
  active_subscription_count: number;
}

export interface AdminPushConfig {
  configured: boolean;
  public_key?: string | null;
  subject?: string | null;
}

export interface CurrentAdminDeviceResponse {
  device: AdminDeviceRecord;
  push: AdminPushConfig;
}

const SERVICE_WORKER_PATH = '/admin-push-sw.js';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function getServiceWorkerRegistration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/admin/' });
  // A newly installed worker must activate before pushManager.subscribe is usable.
  if (!registration.active) {
    await new Promise<void>((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return reject(new Error('Push service worker could not start. Please try again.'));
      const check = () => {
        if (worker.state === 'activated') resolve();
        if (worker.state === 'redundant') reject(new Error('Push service worker could not start. Please try again.'));
      };
      worker.addEventListener('statechange', check);
      check();
    });
  }
  return registration;
}

export async function registerAdminServiceWorker() {
  return getServiceWorkerRegistration();
}

export async function enableAdminPushNotifications(getToken: GetTokenFn) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  // Request permission directly from the click gesture (required by Safari).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Push notification permission was not granted.');
  }

  const current = await authGet<CurrentAdminDeviceResponse>('/admin/devices/current', getToken);
  const pushConfig = current.data.push;

  if (!pushConfig.configured || !pushConfig.public_key) {
    throw new Error('Web push is not configured on the server yet.');
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    throw new Error('Service workers are not supported in this browser.');
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pushConfig.public_key),
    }));

  const json = subscription.toJSON();
  await authPost(
    '/admin/devices/current/push_subscription',
    {
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
      },
    },
    getToken
  );

  return subscription;
}

export async function disableAdminPushNotifications(getToken: GetTokenFn) {
  const registration = await navigator.serviceWorker?.getRegistration('/admin/');
  const existingSubscription = registration ? await registration.pushManager.getSubscription() : null;

  await authDelete('/admin/devices/current/push_subscription', getToken);
  if (existingSubscription) await existingSubscription.unsubscribe();
}
