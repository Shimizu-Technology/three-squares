import { useEffect, useState, useRef } from 'react';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

// Cache with TTL — settings changes propagate within 2 minutes without a page reload
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

let cachedConfig: AppConfig | null = null;
let cacheTimestamp: number | null = null;
let inFlight: Promise<AppConfig> | null = null;

function isCacheValid(): boolean {
  if (!cachedConfig || cacheTimestamp === null) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/** Call this after saving admin settings to force an immediate refresh for all hooks. */
export function invalidateAppConfig() {
  cachedConfig = null;
  cacheTimestamp = null;
  inFlight = null;
}

export default function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(isCacheValid() ? cachedConfig : null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isCacheValid()) {
      return;
    }

    if (!inFlight) {
      inFlight = configApi.getConfig()
        .then((data) => {
          cachedConfig = data;
          cacheTimestamp = Date.now();
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

  return config;
}
