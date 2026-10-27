import { test, expect, type Page } from '@playwright/test';

const makeOrder = (shipping = false) => ({
  id: 97001, order_number: 'TSQ-DIALOG-TEST', customer_name: 'Synthetic lunch guest with a long name '.repeat(3),
  customer_email: 'dialog@example.test', customer_phone: '5550100', location_id: 1, location_name: 'Main',
  fulfillment_type: shipping ? 'shipping' : 'pickup', order_type: 'retail', source: 'online',
  status: shipping ? 'processing' : 'pending', payment_status: 'paid', payment_environment: 'sandbox',
  total_cents: 2500, subtotal_cents: 2500, shipping_cost_cents: 0, tax_cents: 0,
  item_count: 40, line_count: 40, created_at: new Date().toISOString(),
  next_status_options: shipping ? ['shipped', 'cancelled'] : ['confirmed', 'cancelled'],
  notes: 'Sauce separately. No peanuts. '.repeat(20),
  order_items: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, product_name: `Packing line ${String(i + 1).padStart(2, '0')}`,
    variant_name: 'Large meal', quantity: 1, unit_price_cents: 500, total_price_cents: 500,
    special_instructions: 'Keep utensils and sauces separate. ' + 'Long packing instructions. '.repeat(3) })),
});
async function orders(page: Page, shipping = false) {
  const order = makeOrder(shipping);
  await page.route('**/api/v1/admin/orders**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({ json: { total_orders: 1, paid_orders: 1, status_counts: { pending: 1 }, queue_stage_counts: { new_paid: 1 } } });
    if (path.endsWith(`/${order.id}`)) return route.fulfill({ json: { order } });
    return route.fulfill({ json: { orders: [order], pagination: { current_page: 1, total_pages: 1, total_count: 1 } } });
  });
  return order;
}
async function focusStaysInside(page: Page) {
  for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.matches(':modal'))).toBe(true);
  }
}
for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`order and nested refund use native focus and pending dismissal guards at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const order = await orders(page);
    await page.goto('/admin/orders/pickup-queue');
    const details = page.getByRole('article', { name: `Order ${order.order_number}`, exact: true }).getByRole('button', { name: 'Details', exact: true });
    await details.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.addEventListener('mousedown', event => {
      if ((event.target as HTMLElement).closest('button')?.textContent === 'Details') event.preventDefault();
    }, true));
    const box = (await details.boundingBox())!;
    const y = await page.evaluate(() => scrollY);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const outer = page.getByRole('dialog', { name: `Order # ${order.order_number}`, exact: true });
    await expect(outer).toBeVisible(); await focusStaysInside(page);
    const refundButton = outer.getByRole('button', { name: 'Refund Order', exact: true });
    await refundButton.click();
    const refund = page.getByRole('dialog', { name: 'Refund Order', exact: true });
    await expect(refund).toBeVisible();
    expect(await page.locator('dialog:modal').count()).toBe(2);
    await focusStaysInside(page);
    await page.keyboard.press('Escape');
    await expect(refund).not.toBeVisible(); await expect(refundButton).toBeFocused();
    await refundButton.click();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v1/admin/orders/${order.id}/refund`, async route => {
      await pending;
      await route.fulfill({ status: 422, json: { error: 'Synthetic rejection before dispatch', no_operation: true } });
    });
    await refund.getByRole('button', { name: 'Process Refund', exact: true }).click();
    await expect(refund.getByRole('button', { name: 'Checking...', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    await expect(refund).toBeVisible();
    await expect(refund.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    release();
    await expect(refund.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    await refund.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(refundButton).toBeFocused();
    await refundButton.click();
    await page.route(`**/api/v1/admin/orders/${order.id}/refund`, route => route.fulfill({ json: {
      success: true, status: 'succeeded', operation_uuid: '00000000-0000-4000-8000-000000000001',
      order: { ...order, payment_status: 'refunded', total_refunded_cents: 2500, refundable_amount_cents: 0 },
    } }));
    await refund.getByRole('button', { name: 'Process Refund', exact: true }).click();
    await expect(refund).not.toBeVisible();
    await expect(outer.getByRole('heading', { name: `Order # ${order.order_number}`, exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(outer).not.toBeVisible();
    await expect(details).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test(`shipping nests above order details and preserves failed tracking drafts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const order = await orders(page, true);
    await page.goto(`/admin/orders?id=${order.id}`);
    const outer = page.getByRole('dialog', { name: `Order # ${order.order_number}`, exact: true });
    const opener = outer.getByRole('button', { name: 'Ship', exact: true });
    await opener.click();
    const ship = page.getByRole('dialog', { name: 'Ship Order', exact: true });
    await expect(ship.getByLabel('Shipping Carrier', { exact: true })).toBeFocused();
    await ship.getByLabel('Shipping Carrier', { exact: true }).selectOption('USPS');
    await ship.getByLabel('Tracking Number', { exact: true }).fill('SYNTHETIC-TRACKING');
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v1/admin/orders/${order.id}`, async route => {
      if (route.request().method() !== 'PATCH') return route.fulfill({ json: { order } });
      await pending;
      return route.fulfill({ status: 500, json: { error: 'Synthetic save failure' } });
    });
    await ship.getByRole('button', { name: 'Mark as Shipped', exact: true }).click();
    await expect(ship.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(ship).toBeVisible();
    release();
    await expect(ship.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect(ship.getByLabel('Tracking Number', { exact: true })).toHaveValue('SYNTHETIC-TRACKING');
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape'); await expect(outer).not.toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test(`cash and portion dialogs contain focus and block background POS shortcuts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/v1/admin/payment_terminals**', route => route.fulfill({ json: { terminals: [] } }));
    await page.route('**/api/v1/admin/pos/menu**', route => route.fulfill({ json: { locations: [{ id: 1, name: 'Main' }],
      categories: [{ name: 'Lunch', items: [{ id: 97101, name: 'Synthetic lunch portions', product_type: 'local',
        variants: [1, 2].map(i => ({ id: 97110 + i, name: i === 1 ? 'Small' : 'Large', price_cents: i * 1000,
          price_formatted: `$${i * 10}.00`, in_stock: true, available_quantity: 50, inventory_pool_key: `Variant:${i}` })) }] }], total_products: 1 } }));
    await page.goto('/admin/pos');
    const tile = page.getByRole('button', { name: /^Synthetic lunch portions/ });
    await tile.click();
    const picker = page.getByRole('dialog', { name: 'Synthetic lunch portions', exact: true });
    await expect(picker).toBeVisible(); await focusStaysInside(page);
    await page.keyboard.press('F8');
    await expect(page.getByRole('dialog', { name: 'Cash Payment', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(tile).toBeFocused();
    await tile.click(); await picker.getByRole('button', { name: 'Small $10.00', exact: true }).click();
    await page.getByPlaceholder('Customer Name', { exact: true }).fill('Synthetic lunch team');
    const cashButton = page.getByRole('button', { name: 'Cash', exact: true });
    await cashButton.click();
    const cash = page.getByRole('dialog', { name: 'Cash Payment', exact: true });
    await expect(cash.getByLabel('Cash Received', { exact: true })).toBeFocused();
    await cash.getByLabel('Cash Received', { exact: true }).fill('20');
    await expect(cash.getByText('$10.00', { exact: true }).last()).toBeVisible();
    await focusStaysInside(page);
    await page.keyboard.press('F2'); await page.keyboard.press('F8'); await page.keyboard.press('F9');
    expect(await page.locator('dialog:modal').count()).toBe(1);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/admin/pos/orders', async route => {
      expect(route.request().postDataJSON().order.cash_received_cents).toBe(2000);
      await pending; return route.fulfill({ status: 422, json: { error: 'Synthetic rejection before an order exists', outcome: 'rejected', no_attempt: true } });
    });
    page.once('dialog', dialog => dialog.accept());
    await cash.getByRole('button', { name: 'Complete Cash Payment', exact: true }).click();
    await expect(cash.getByRole('button', { name: 'Close Cash Payment', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(cash).toBeVisible();
    release();
    await expect(cash).not.toBeVisible(); await expect(cashButton).toBeFocused();
    await expect(cashButton).toBeEnabled();
    await page.route('**/api/v1/admin/pos/orders', route => route.fulfill({ status: 201, json: {
      id: 97999, order_number: 'SYNTHETIC-CASH', total_cents: 1000, total_formatted: '$10.00', payment_status: 'paid', location_id: 1,
    } }));
    await cashButton.click();
    await cash.getByRole('button', { name: 'Complete Cash Payment', exact: true }).click();
    await expect(cash).not.toBeVisible(); await expect(cashButton).toBeDisabled();
    await expect(page.getByRole('searchbox', { name: 'Find a menu item', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}
