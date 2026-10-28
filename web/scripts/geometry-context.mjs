/** Deterministic component fixtures: no API, identity, CDN or payment traffic. */
export async function prepareGeometryContext(context, fixtureURL) {
  const origin = new URL(fixtureURL).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Loopback fixture required');
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(15_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return (url.origin === origin && !url.pathname.startsWith('/api/')) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort('blockedbyclient');
  });
}
