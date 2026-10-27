import { useEffect, useState } from 'react';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

let cachedConfig: AppConfig | null = null;
let inFlight: Promise<AppConfig | null> | null = null;
let hasResolvedConfig = false;
const listeners = new Set<(config: AppConfig | null) => void>();
const CONFIG_REFRESH_STORAGE_KEY = 'threesquares:app-config-refresh';

const notifyListeners = (config: AppConfig | null) => {
  listeners.forEach((listener) => listener(config));
};

const fetchConfig = async (force = false): Promise<AppConfig | null> => {
  if (!force && hasResolvedConfig) {
    return cachedConfig;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = configApi.getConfig()
    .then((data) => {
      cachedConfig = data;
      hasResolvedConfig = true;
      notifyListeners(data);
      return data;
    })
    .catch((error) => {
      console.error('Failed to load app config:', error);
      hasResolvedConfig = true;
      notifyListeners(cachedConfig);
      return cachedConfig;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

export const refreshAppConfig = async (options?: { broadcast?: boolean }) => {
  const config = await fetchConfig(true);

  if (options?.broadcast && typeof window !== 'undefined') {
    localStorage.setItem(CONFIG_REFRESH_STORAGE_KEY, Date.now().toString());
  }

  return config;
};

export default function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null | undefined>(
    hasResolvedConfig ? cachedConfig : undefined
  );

  useEffect(() => {
    listeners.add(setConfig);

    if (!hasResolvedConfig) {
      void fetchConfig();
    }

    const handleStorageRefresh = (event: StorageEvent) => {
      if (event.key === CONFIG_REFRESH_STORAGE_KEY) {
        void fetchConfig(true);
      }
    };

    window.addEventListener('storage', handleStorageRefresh);

    return () => {
      listeners.delete(setConfig);
      window.removeEventListener('storage', handleStorageRefresh);
    };
  }, []);

  return config;
}
