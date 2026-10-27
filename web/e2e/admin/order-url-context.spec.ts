import { test, expect, type Page } from '@playwright/test';

const fixture = (id: number) => ({
  id, order_number: `URL-${id}`, customer_name: 'Lunch guest with a long packing name',
  customer_email: 'url-fixture@example.test', location_id: 1, location_name: 'Main',
  fulfillment_type: 'pickup', order_type: 'retail', status: 'pending', payment_status: 'paid',
  total_cents: 1500, subtotal_cents: 1500, shipping_cost_cents: 0, tax_cents: 0,
  item_count: 3, line_count: 1, created_at: new Date().toISOString(),
  next_status_options: ['confirmed', 'cancelled'], notes: 'Keep sauce separate. '.repeat(12),
  order_items: [{ id, product_name: 'Lunch meal', variant_name: 'Large', quantity: 3, unit_price_cents: 500, total_price_cents: 1500 }],
});
const summary = { total_orders: 26, paid_orders: 26, total_revenue_cents: 39000, status_counts: { pending: 26 }, queue_stage_counts: { new_paid: 26, waiting_payment: 0, confirmed: 0, ready: 0, picked_up: 0, all_active: 26 } };
const query = async (page: Page, key: string) => new URL(page.url()).searchParams.get(key);

// Only the order API is isolated. The actual page, router, filter controls,
// polling and modal execute with the standard admin authentication setup.
test('submitted filters, page and selection survive history and reload without reads on each keystroke', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/v1/admin/orders**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: summary });
    if (/\/\d+$/.test(url.pathname)) return route.fulfill({ json: { order: fixture(91002) } });
    reads += 1;
    return route.fulfill({ json: { orders: [fixture(91002)], pagination: { total_count: 26, total_pages: 2 } } });
  });
  await page.goto('/admin/orders/pickup-queue?search=Lunch&status=all&order_type=wholesale&business_line=catering&location=1&datepreset=all_time&page=2');
  const card = page.getByRole('article', { name: 'Order URL-91002', exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByLabel('Stage', { exact: true })).toHaveValue('all');
  await expect(page.getByLabel('Order type', { exact: true })).toHaveValue('wholesale');
  await expect(page.getByLabel('Business line', { exact: true })).toHaveValue('catering');
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('1');
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  const context = page.url();
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).toBeVisible();
  expect(await query(page, 'id')).toBe('91002');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).not.toBeVisible();
  await expect(page).toHaveURL(context);
  await expect(card.getByRole('button', { name: 'Details', exact: true })).toBeFocused();
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Close order details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close order details', exact: true }).click();
  await expect(page).toHaveURL(context);
  await expect(page.getByRole('heading', { name: 'Pickup Queue', exact: true })).toBeFocused();
  const before = reads;
  await page.getByRole('textbox', { name: 'Find an order', exact: true }).fill('Other guest');
  expect(await query(page, 'search')).toBe('Lunch');
  expect(reads).toBe(before);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => query(page, 'search')).toBe('Other guest');
  await expect.poll(() => query(page, 'page')).toBe('1');
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Find an order', exact: true })).toHaveValue('Lunch');
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
});

test('closing a delayed deep link prevents reopening and failed detail reads can retry', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  let fail = true;
  await page.route('**/api/v1/admin/orders**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    if (path.endsWith('/91001')) {
      started = true;
      await gate;
      return route.fulfill({ json: { order: fixture(91001) } });
    }
    if (path.endsWith('/91002')) return fail ? route.fulfill({ status: 500, json: { error: 'Temporary fixture outage' } }) : route.fulfill({ json: { order: fixture(91002) } });
    return route.fulfill({ json: { orders: [fixture(91002)], pagination: { total_count: 1, total_pages: 1 } } });
  });
  await page.goto('/admin/orders/pickup-queue?id=91001');
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Close order details', exact: true }).click();
  await page.getByRole('article', { name: 'Order URL-91002', exact: true }).getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load order #91002');
  release();
  fail = false;
  await page.getByRole('button', { name: 'Retry order details', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('URL-91002');
  expect(await query(page, 'id')).toBe('91002');
  await expect(page.getByRole('heading', { level: 2 })).not.toContainText('URL-91001');
});

test('successful last-row mutation replaces an invalid page before publishing an empty list', async ({ page }) => {
  let moved = false;
  await page.route('**/api/v1/admin/orders**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: summary });
    if (route.request().method() === 'PATCH') {
      moved = true;
      return route.fulfill({ json: { order: { ...fixture(91002), status: 'confirmed' } } });
    }
    const second = url.searchParams.get('page') === '2';
    return route.fulfill({ json: { orders: moved && second ? [] : [fixture(second ? 91002 : 91001)], pagination: { total_count: moved ? 25 : 26, total_pages: moved ? 1 : 2 } } });
  });
  await page.goto('/admin/orders/pickup-queue?page=2');
  await page.getByRole('article', { name: 'Order URL-91002', exact: true }).getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect.poll(() => query(page, 'page')).toBe('1');
  await expect(page.getByRole('article', { name: 'Order URL-91001', exact: true })).toBeVisible();
  await expect(page.getByText('No matching orders', { exact: true })).not.toBeVisible();
});


test('a saved historical Today URL retains its dates with an honest Custom range label', async ({ page }) => {
  await page.goto('/admin/orders/pickup-queue?datepreset=today&start=2000-01-01&end=2000-01-01');
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2000-01-01');
  await expect(page.getByLabel('End date', { exact: true })).toHaveValue('2000-01-01');
  expect(await query(page, 'datepreset')).toBe('custom');
  await page.getByLabel('Period', { exact: true }).selectOption('today');
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('today');
  expect(await query(page, 'start')).not.toBe('2000-01-01');
  await page.goBack();
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2000-01-01');
});
