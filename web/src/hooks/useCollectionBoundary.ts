import { useEffect } from 'react';
import { nextCollectionRefreshAt } from '../utils/collectionSchedule';
import type { CollectionSchedule } from '../utils/collectionSchedule';

// Refresh an open page at its next known boundary, and when returning from a background tab.
export default function useCollectionBoundary(collections: CollectionSchedule[], refresh: () => void) {
  useEffect(() => {
    const now = Date.now();
    const next = nextCollectionRefreshAt(collections, now);
    const timer = next === undefined ? undefined
      : window.setTimeout(refresh, Math.min(Math.max(next - now, 0), 2_147_483_647));
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [collections, refresh]);
}
