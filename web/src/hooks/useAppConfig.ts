import { useSyncExternalStore } from 'react';
import { configApi } from '../services/api';
import { createAppConfigCache } from '../lib/appConfigCache.ts';

export const appConfigCache = createAppConfigCache(async () => {
  const config = await configApi.getConfig();
  if (typeof config.online_ordering_paused !== 'boolean') throw new Error('Ordering status is unavailable');
  return config;
}, 15_000);

// All mounted consumers refresh after a save; stale in-flight responses are discarded.
export const invalidateAppConfig = appConfigCache.invalidate;

export default function useAppConfig() {
  return useSyncExternalStore(appConfigCache.subscribe, appConfigCache.getSnapshot, () => null);
}
