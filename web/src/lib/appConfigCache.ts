export function createAppConfigCache<T>(load: () => Promise<T>, ttlMs = 120_000) {
  let config: T | null = null;
  let cachedAt: number | null = null;
  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  function schedule(delay = ttlMs) {
    if (timer !== null || listeners.size === 0) return;
    timer = setTimeout(() => {
      timer = null;
      refresh(true);
    }, delay);
  }

  function refresh(force = false) {
    const valid = cachedAt !== null && Date.now() - cachedAt < ttlMs;
    if (inFlight || (!force && valid)) return;
    const requestedGeneration = generation;
    const request = Promise.resolve()
      .then(load)
      .then((data) => {
        if (requestedGeneration !== generation) return;
        config = data;
        cachedAt = Date.now();
        notify();
      })
      .catch((error: unknown) => console.error('Failed to load app config:', error))
      .finally(() => {
        // An invalidated request cannot clear or reschedule its replacement.
        if (inFlight !== request) return;
        inFlight = null;
        schedule();
      });
    inFlight = request;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    refresh();
    schedule(cachedAt === null ? ttlMs : Math.max(0, ttlMs - (Date.now() - cachedAt)));
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
    clearTimer();
    notify();
    if (listeners.size > 0) refresh(true);
  }

  return { subscribe, getSnapshot: () => config, invalidate };
}
