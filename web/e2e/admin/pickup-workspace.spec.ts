import { test, expect } from '@playwright/test';

// Actual admin UI with isolated API fixtures. Uses the standard admin auth setup;
// no messages, inventory writes or payment processors are involved.
const order = {
  id: 91001, order_number: 'TSQ-PACKING-TEST', customer_name: 'Long lunch guest '.repeat(12),
  customer_email: 'fixture@example.test', location_id: 1, location_name: 'Main',
  fulfillment_type: 'pickup', order_type: 'retail', status: 'pending', payment_status: 'paid',
  total_cents: 2500, subtotal_cents: 2500, shipping_cost_cents: 0, tax_cents: 0,
  item_count: 5, line_count: 2, created_at: new Date().toISOString(),
  next_status_options: ['confirmed', 'cancelled'], notes: 'Sauce separately. '.repeat(30),
  order_items: [
    { id: 1, product_name: 'Chicken', variant_name: 'Large', quantity: 2, unit_price_cents: 500, total_price_cents: 1000, special_instructions: 'No peanuts' },
    { id: 2, product_name: 'Pancakes', variant_name: 'Short stack', quantity: 3, unit_price_cents: 500, total_price_cents: 1500, special_instructions: 'No butter' },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/admin/orders**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) {
      await route.fulfill({ json: { total_orders: 1, paid_orders: 1, total_revenue_cents: 2500, status_counts: { pending: 1 }, queue_stage_counts: { new_paid: 1, waiting_payment: 0, confirmed: 0, ready: 0, picked_up: 0, all_active: 1 } } });
    } else if (path.endsWith(`/${order.id}`)) {
      await route.fulfill({ json: { order } });
    } else {
      await route.fulfill({ json: { orders: [order], pagination: { current_page: 1, per_page: 25, total_count: 1, total_pages: 1 } } });
    }
  });
});

test('Custom range reopens manually closed advanced filters even with All pickup orders selected', async ({ page }) => {
  await page.goto('/admin/orders/pickup-queue');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByLabel('Stage', { exact: true }).selectOption('all');
  await page.getByText('More filters · filters applied', { exact: true }).click();
  await expect(page.getByLabel('Start date', { exact: true })).not.toBeVisible();
  await page.getByLabel('Period', { exact: true }).selectOption('custom');
  await expect(page.getByLabel('Start date', { exact: true })).toBeVisible();
  await expect(page.getByLabel('End date', { exact: true })).toBeVisible();
});

test('Details restores its explicit opener for Safari-style pointer activation and keyboard activation', async ({ page }) => {
  await page.goto('/admin/orders/pickup-queue');
  const details = page.getByRole('article', { name: `Order ${order.order_number}`, exact: true }).getByRole('button', { name: 'Details', exact: true });
  await expect(details).toBeVisible();
  // Safari does not focus a button on pointer activation. Suppress the default
  // mouse focus in Chromium so document.activeElement cannot supply the opener.
  await page.evaluate(() => document.addEventListener('mousedown', event => {
    if ((event.target as HTMLElement).closest('button')?.textContent === 'Details') event.preventDefault();
  }, true));
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await details.scrollIntoViewIfNeeded();
  const box = (await details.boundingBox())!;
  const y = await page.evaluate(() => scrollY);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close order details', exact: true }).click();
  await expect(details).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
  await details.press('Enter');
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close order details', exact: true }).press('Enter');
  await expect(details).toBeFocused();
});

test('public/admin round trips keep native scrolling free of SmoothScroll frames', async ({ page }) => {
  await page.addInitScript(() => {
    const pending = new Set<number>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    Object.assign(window, { packingSmoothFrames: pending });
    window.requestAnimationFrame = callback => {
      const owned = new Error().stack?.includes('/components/SmoothScroll') || callback.toString().includes('lenis.raf');
      const id = request(time => { pending.delete(id); callback(time); });
      if (owned) pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
  });
  await page.goto('/admin/orders/pickup-queue');
  for (let trip = 0; trip < 3; trip += 1) {
    await page.getByText('View Store', { exact: true }).click();
    await expect(page).toHaveURL('/');
    // Public motion cleanup removed Lenis; neither route starts its RAF loop.
    await expect.poll(() => page.evaluate(() => (window as unknown as { packingSmoothFrames: Set<number> }).packingSmoothFrames.size)).toBe(0);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Pickup Queue', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { packingSmoothFrames: Set<number> }).packingSmoothFrames.size)).toBe(0);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as unknown as { packingSmoothFrames: Set<number> }).packingSmoothFrames.size)).toBe(0);
  }
});
