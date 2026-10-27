import { useSyncExternalStore } from 'react';
import { appConfigCache } from './useAppConfig';

// The public config is the authority for pause and connectivity. Staff routes
// never mount this hook as a prerequisite to their workspace.
export function useBackendAvailability() {
  const state = useSyncExternalStore(appConfigCache.subscribeConnection, appConfigCache.getConnectionSnapshot, appConfigCache.getConnectionSnapshot);
  return { ...state, retry: appConfigCache.retry };
}
