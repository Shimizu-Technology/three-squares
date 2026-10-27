import { useEffect } from 'react';
import type { CollectionSchedule } from '../utils/collectionSchedule';

// Refresh an open page at its next known boundary, and when returning from a background tab.
export default function useCollectionBoundary(collections: CollectionSchedule[], refresh: () => void) {
  useEffect(() => {
    const now = Date.now();
    const boundaries = collections.flatMap((collection) => [collection.starts_at, collection.ends_at])
      // API timestamps have second precision; wait past the complete represented second.
      .filter((value): value is string => Boolean(value)).map((value) => Date.parse(value) + 1_100)
      .filter((value) => value > now);
    const next = Math.min(...boundaries);
    const timer = Number.isFinite(next)
      ? window.setTimeout(refresh, Math.min(next - now, 2_147_483_647)) : undefined;
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
