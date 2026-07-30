import { useEffect, useState, useRef, useCallback } from 'react';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

// Cache with TTL — settings changes propagate within 2 minutes without a page reload
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

let cachedConfig: AppConfig | null = null;
let cacheTimestamp: number | null = null;
let inFlight: Promise<AppConfig> | null = null;
// Monotonically-increasing version counter; used to detect stale in-flight responses
// after an invalidation so they do not silently overwrite a fresh fetch.
let cacheVersion = 0;

// All currently-mounted useAppConfig hooks register here so they can be notified
// immediately when the cache is invalidated (e.g. after an admin saves settings).
const invalidationListeners = new Set<() => void>();

function isCacheValid(): boolean {
  if (!cachedConfig || cacheTimestamp === null) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Call this after saving admin settings to force an immediate refresh for all
 * currently-mounted useAppConfig hooks (and any future mounts within the TTL window).
 *
 * Safe to call while a fetch is in-flight: the version guard below ensures the
 * in-flight response will not repopulate the cache once it arrives.
 */
export function invalidateAppConfig() {
  cachedConfig = null;
  cacheTimestamp = null;
  inFlight = null;
  cacheVersion += 1;
  // Trigger a fresh fetch in every mounted useAppConfig hook.
  invalidationListeners.forEach((listener) => listener());
}

export default function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(isCacheValid() ? cachedConfig : null);
  const mountedRef = useRef(true);

  // Track mount state for the cleanup return only — no no-op assignment needed
  // because useRef already initialises current to true.
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchConfig = useCallback(() => {
    if (isCacheValid()) {
      // Cache is still warm — update local state from the shared cache so this
      // hook instance reflects the latest value even after a re-subscribe.
      setConfig(cachedConfig);
      return;
    }

    // Snapshot the version at the time this fetch was kicked off.  If
    // invalidateAppConfig() is called before the response arrives, the version
    // will have advanced and the stale response must not populate the cache.
    const versionAtStart = cacheVersion;

    if (!inFlight) {
      inFlight = configApi.getConfig()
        .then((data) => {
          if (versionAtStart === cacheVersion) {
            // No invalidation happened while we were waiting — safe to cache.
            cachedConfig = data;
            cacheTimestamp = Date.now();
          }
          inFlight = null;
          return data;
        })
        .catch((error) => {
          console.error('Failed to load app config:', error);
          inFlight = null;
          return null as unknown as AppConfig;
        });
    }

    inFlight.then((data) => {
      if (data && mountedRef.current) {
        setConfig(data);
      }
    });
  }, []);

  useEffect(() => {
    fetchConfig();

    // Subscribe so this hook re-fetches whenever invalidateAppConfig() is called,
    // even if the component is already mounted (i.e. the effect deps won't re-run
    // on their own).
    invalidationListeners.add(fetchConfig);
    return () => {
      invalidationListeners.delete(fetchConfig);
    };
  }, [fetchConfig]);

  return config;
}
