import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Exercise dialog behavior independently of service-health availability.
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
});

test('cart contains keyboard focus, makes the page inert and returns to its opener', async ({ page }) => {
  // Deterministic empty guest cart; this test does not mutate server data.
  await page.route('**/api/v1/cart', (route) => route.fulfill({ json: {
    id: 1, items: [], item_count: 0, subtotal_cents: 0,
  } }));
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Shopping cart with 0 items' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Shopping Cart' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close cart' })).toBeFocused();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await dialog.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
  }
  // Programmatic focus must also be blocked, beyond a scripted Tab loop.
  await opener.evaluate((button) => button.focus());
  expect(await dialog.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close cart' }).click();
  await expect(opener).toBeFocused();
});

test('pointer-opened size guide returns focus to its trigger', async ({ page }) => {
  await page.route('**/api/v1/locations', (route) => route.fulfill({ json: { locations: [] } }));
  await page.route('**/api/v1/products/dialog-fixture*', (route) => route.fulfill({ json: {
    id: 1, name: 'Dialog fixture dish', slug: 'dialog-fixture',
    description: '<img src="data:image/svg+xml,%3Csvg/%3E" alt="Fixture chart">',
    featured: false, published: true, product_type: 'local', base_price_cents: 1000,
    inventory_level: 'none', in_stock: true, actually_available: true,
    allow_pickup: true, available_location_ids: [], collections: [], images: [],
    variants: [{ id: 1, sku: 'DIALOG-FIXTURE', display_name: 'One Size', size: 'Default',
      price_cents: 1000, available: true, in_stock: true, actually_available: true, options: {} }],
  } }));
  await page.goto('/products/dialog-fixture');
  const trigger = page.getByRole('button', { name: 'View Size Guide' });
  await expect(trigger).toBeVisible();
  // Safari pointer activation does not necessarily focus a button. Start elsewhere.
  await page.getByRole('spinbutton', { name: 'Quantity:' }).focus();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Size Guide', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
