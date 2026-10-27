self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object') data = {};
  event.waitUntil(self.registration.showNotification(data.title || 'Three Squares', {
    body: data.body,
    data,
    tag: data.tag,
    badge: '/images/three-squares-logo.png',
    icon: '/images/three-squares-logo.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Notification data must never navigate an admin to another origin or storefront.
  const fallback = new URL('/admin/orders', self.location.origin);
  let target = fallback;
  try {
    const candidate = new URL(event.notification.data?.url || fallback.href, self.location.origin);
    if (candidate.origin === self.location.origin && candidate.pathname.startsWith('/admin/')) target = candidate;
  } catch { /* Use the orders page for malformed links. */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && url.pathname.startsWith('/admin/') && 'navigate' in client) {
        const navigated = await client.navigate(target.href);
        if (navigated) return navigated.focus();
      }
    }
    return self.clients.openWindow?.(target.href);
  })());
});
