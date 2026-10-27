import { devices, expect, test } from '@playwright/test';

test.use({ ...devices['iPhone 13'], browserName: 'chromium' });

test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/config*', (route) => route.fulfill({ json: {
    enable_storefront_three_squares: true,
  } }));
  await page.route('**/api/v1/locations', (route) => route.fulfill({ json: { locations: [] } }));
  await page.route('**/api/v1/collections*', (route) => route.fulfill({ json: { collections: [] } }));
  await page.route('**/api/v1/products?*', (route) => route.fulfill({ json: {
    products: [], meta: { page: 1, per_page: 12, total: 0, product_types: [] },
  } }));
  await page.route('**/api/v1/cart', (route) => route.fulfill({ json: {
    items: [], item_count: 0, subtotal_cents: 0,
  } }));
});

test('phone controls stay legible and cart opens without travel under reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/products');
  await expect(page.locator('#menu-search')).toBeVisible();

  const controls = await page.locator('input, select').evaluateAll((elements) =>
    elements.filter((element) => element.getClientRects().length > 0)
      .map((element) => parseFloat(getComputedStyle(element).fontSize)));
  expect(controls.length).toBeGreaterThan(0);
  expect(Math.min(...controls)).toBeGreaterThanOrEqual(16);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');

  await page.getByRole('button', { name: /Shopping cart with 0 items/i }).click();
  const cart = page.getByRole('dialog', { name: /Shopping Cart/i });
  await expect(cart).toBeVisible();
  await expect(cart.getByText('Browse the menu and choose a meal for pickup.')).toBeVisible();
  await expect(cart.getByRole('button', { name: 'Browse Menu' })).toBeVisible();
  expect(await cart.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  expect(await cart.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(await cart.evaluate((element) => Math.max(...getComputedStyle(element).transitionDuration
    .split(',').map((duration) => Number(duration.trim().replace('s', '')))))).toBeLessThan(0.001);
  await page.keyboard.press('Escape');
  await expect(cart).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Shopping cart with 0 items/i })).toBeFocused();
});
