import { useSyncExternalStore } from 'react';
import { configApi } from '../services/api';
import { createAppConfigCache } from '../lib/appConfigCache.ts';

const cache = createAppConfigCache(() => configApi.getConfig());

// All mounted consumers refresh after a save; stale in-flight responses are discarded.
export const invalidateAppConfig = cache.invalidate;

export default function useAppConfig() {
  return useSyncExternalStore(cache.subscribe, cache.getSnapshot, () => null);
}
