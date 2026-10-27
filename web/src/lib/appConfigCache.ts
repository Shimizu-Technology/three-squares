export type ConnectionStatus = 'checking' | 'available' | 'unavailable';

export function createAppConfigCache<T>(load: () => Promise<T>, ttlMs = 120_000) {
  let config: T | null = null;
  let cachedAt: number | null = null;
  let generation = 0;
  let failures = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let connection: { status: ConnectionStatus; config: T | null; failures: number } = { status: 'checking', config, failures: 0 };
  const listeners = new Set<() => void>();
  const connectionListeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const updateConnection = (status: ConnectionStatus) => {
    connection = { status, config, failures };
    connectionListeners.forEach(listener => listener());
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const retryDelay = () => Math.min(30_000, 2_000 * 2 ** Math.min(failures - 1, 4));

  function schedule(delay = failures ? retryDelay() : ttlMs) {
    if (timer !== null || listeners.size === 0) return;
    timer = setTimeout(() => { timer = null; refresh(true); }, delay);
  }

  function refresh(force = false) {
    const valid = cachedAt !== null && Date.now() - cachedAt < ttlMs;
    if (inFlight || (!force && valid)) return;
    clearTimer();
    const requestedGeneration = generation;
    const request = Promise.resolve().then(load).then(data => {
      if (requestedGeneration !== generation) return;
      config = data;
      cachedAt = Date.now();
      failures = 0;
      updateConnection('available');
      notify();
    }).catch(() => {
      if (requestedGeneration !== generation) return;
      failures += 1;
      // Retain the last successful config and all mounted content on failure.
      updateConnection('unavailable');
    }).finally(() => {
      if (inFlight !== request) return;
      inFlight = null;
      schedule();
    });
    inFlight = request;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    refresh();
    if (!inFlight) schedule(cachedAt === null ? (failures ? retryDelay() : ttlMs) : Math.max(0, ttlMs - (Date.now() - cachedAt)));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) clearTimer();
    };
  }

  function invalidate() {
    generation += 1;
    config = null;
    cachedAt = null;
    inFlight = null;
    failures = 0;
    clearTimer();
    updateConnection('checking');
    notify();
    if (listeners.size > 0) refresh(true);
  }

  function subscribeConnection(listener: () => void) {
    connectionListeners.add(listener);
    const unsubscribe = subscribe(() => {});
    return () => { connectionListeners.delete(listener); unsubscribe(); };
  }

  return { subscribe, getSnapshot: () => config, invalidate,
    subscribeConnection, getConnectionSnapshot: () => connection,
    retry: () => refresh(true) };
}
