import { test, expect } from '@playwright/test';

const reason = 'This item now requires a catering inquiry';
for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`owner gate saves independently and retries without losing store drafts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let enabled = false, reject = true;
    const writes: unknown[] = [];
    const settings = () => ({ payment_test_mode: false, payment_processor: 'stripe', store_name: 'Fixture store', store_email: 'store@example.test', store_phone: '5550100', order_notification_emails: [], shipping_origin_address: { company: 'Fixture store', street1: 'Fixture street', city: 'Fixture city', state: 'GU', zip: '96913', country: 'US', phone: '5550100' }, announcement_enabled: false, announcement_text: '', announcement_style: 'gold', enable_storefront_three_squares: true, enable_storefront_latte_stone: false, enable_storefront_catering: true, enable_catering_online_ordering: enabled });
    await page.route('**/api/v1/admin/site_settings', route => {
      if (route.request().method() === 'PUT') {
        writes.push(route.request().postDataJSON());
        if (reject) { reject = false; return route.fulfill({ status: 500, json: { error: 'Fixture save failed' } }); }
        enabled = route.request().postDataJSON().site_setting.enable_catering_online_ordering;
      }
      return route.fulfill({ json: settings() });
    });
    await page.route('**/api/v1/admin/settings', route => route.fulfill({ json: { settings: { send_retail_emails: false, send_wholesale_emails: false } } }));
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Store Settings', exact: true })).toBeVisible();
    const storeField = page.getByLabel('Store Name', { exact: true });
    await storeField.fill('Unsaved store draft');
    const toggle = page.getByRole('switch', { name: 'Allow catering online orders', exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(page.getByText('Failed to update storefront setting', { exact: true })).toBeVisible();
    await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    expect(writes).toEqual([{ site_setting: { enable_catering_online_ordering: true } }, { site_setting: { enable_catering_online_ordering: true } }]);
    await expect(storeField).toHaveValue('Unsaved store draft');
    await page.reload(); await expect(toggle).toBeChecked();
  });

  test(`staff can see why the system closed the uncharged saved order at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/v1/admin/orders/99003', route => route.fulfill({ json: { order: {
      id: 99003, order_number: 'SYSTEM-GATE', status: 'cancelled', payment_status: 'pending', payment_environment: 'sandbox',
      order_type: 'retail', source: 'online', customer_name: 'Synthetic catering checkout', customer_email: 'gate@example.test',
      customer_phone: '5550100', total_cents: 1200, subtotal_cents: 1200, shipping_cost_cents: 0, tax_cents: 0,
      created_at: new Date().toISOString(), next_status_options: [], order_items: [], item_count: 0, line_count: 0,
      fulfillment_type: 'pickup', location_id: 1, location_name: 'Main',
      system_cancellation: { actor: 'system', reason: 'catering_inquiry_required' },
    } } }));
    await page.goto('/admin/orders?id=99003');
    await expect(page.getByRole('status').filter({ hasText: 'Closed by system: catering items now require an inquiry.' })).toBeVisible();
    await expect(page.getByText('No payment was started. No cancellation email or SMS was sent.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Close order details', exact: true }).click();
    await expect(page.getByText('Closed by system:', { exact: false })).toHaveCount(0);
  });

  test(`saved-order collection is blocked independently of an empty cart at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => sessionStorage.setItem('tsq-checkout-pending', JSON.stringify({ id: 'saved-gate', capability: 'a'.repeat(64), key: 'fixture-saved-key', orderId: 99002, orderNumber: 'SAVED-GATE', amountCents: 1200 })));
    let cancelled = false;
    const calls: string[] = [];
    await page.route('**/api/v1/checkout_sessions/saved-gate**', route => {
      calls.push(route.request().url());
      if (route.request().url().endsWith('/cancel')) cancelled = true;
      return route.fulfill({ json: { id: 'saved-gate', attempt_id: 'fixture-attempt', payment_identity_id: 'fixture-identity', state: cancelled ? 'cancelled' : 'collecting', payment_state: cancelled ? 'cancelled' : 'collecting', amount_cents: 1200, currency: 'USD', provider: 'stripe', environment: 'sandbox', flow: 'stripe_embedded', collection_config: { available: false, reason, client_secret: 'fixture-stale-secret' }, order: { id: 99002, order_number: 'SAVED-GATE', payment_status: 'pending', inventory_committed: false } } });
    });
    await page.route('**/api/v1/cart**', route => route.fulfill({ json: { items: [], item_count: 0, subtotal_cents: 0 } }));
    await page.goto('/checkout');
    await expect(page.getByRole('alert').filter({ hasText: reason })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry card payment for this saved order', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel saved payment', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel saved payment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Payment closed — review cart and start again', exact: true })).toBeVisible();
    expect(calls.some(url => url.endsWith('/confirm'))).toBe(true);
    expect(calls.some(url => url.endsWith('/cancel'))).toBe(true);
    expect(calls.some(url => url.endsWith('/simulate'))).toBe(false);
  });

  test(`stale catering cart explains inquiry-only recovery and blocks payment at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let removed = false;
    const item = { id: 99001, quantity: 1, subtotal_cents: 0, pricing: { unit_price_cents: null, compare_at_price_cents: null, purchasable: false, reason, price_varies: false, location_id: 1 }, product: { id: 99001, name: 'Fixture catering platter', slug: 'fixture-platter', business_line: 'catering', published: true, allow_pickup: true, allow_shipping: false, available_location_ids: [1], inventory_level: 'none', primary_image_url: null }, product_variant: { id: 99001, display_name: 'Standard tray', price_cents: null, in_stock: true, stock_quantity: 0 }, availability: { available: false, available_quantity: 0, max_available: 0, quantity_exceeds_stock: false } };
    await page.route('**/api/v1/config**', route => route.fulfill({ json: { app_mode: 'test', payment_test_mode: true, payment_processor: 'stripe', features: { payments: false, shipping: false }, store_info: { name: 'Fixture store', email: 'store@example.test', phone: '5550100' }, enable_storefront_three_squares: true, enable_storefront_catering: true } }));
    await page.route('**/api/v1/cart**', route => {
      if (route.request().method() === 'DELETE') removed = true;
      return route.fulfill({ json: { items: removed ? [] : [item], item_count: removed ? 0 : 1, subtotal_cents: 0, pricing_context: { fulfillment_type: 'pickup', location_id: 1 } } });
    });
    await page.goto('/checkout');
    await expect(page.getByRole('alert').filter({ hasText: reason })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay / })).toBeDisabled();
    await page.getByRole('button', { name: /Shopping cart with 1 item/ }).click();
    const cart = page.getByRole('dialog', { name: 'Shopping Cart', exact: true });
    await expect(cart.getByText(reason, { exact: true })).toBeVisible();
    expect((await cart.getByRole('heading', { name: 'Fixture catering platter', exact: true }).boundingBox())?.width).toBeGreaterThan(80);
    await expect(cart.getByRole('button', { name: 'Secure Checkout', exact: true })).toBeDisabled();
    await expect(cart.getByRole('link', { name: 'Start a catering inquiry', exact: true })).toHaveAttribute('href', '/catering');
    await cart.getByRole('button', { name: 'Remove Fixture catering platter from cart', exact: true }).click();
    await expect(cart.getByText('Your cart is empty', { exact: true })).toBeVisible();
  });
}
