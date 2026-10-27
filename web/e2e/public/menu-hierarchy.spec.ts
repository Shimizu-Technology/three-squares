import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/config*', (route) => route.fulfill({ json: {
    enable_storefront_three_squares: true, enable_storefront_catering: true,
  } }));
  await page.route('**/api/v1/cart', (route) => route.fulfill({ json: {
    items: [], subtotal_cents: 0, item_count: 0,
  } }));
  const main = { id: 1, slug: 'main', name: 'Three Squares Main' };
  await page.addInitScript((selectedLocation) => {
    localStorage.setItem('tsq-location', JSON.stringify({ state: { selectedLocation }, version: 0 }));
  }, main);
  await page.route('**/api/v1/locations', (route) => route.fulfill({ json: { locations: [
    main, { id: 2, slug: 'donki', name: 'Three Squares Donki' },
  ] } }));
  await page.route('**/api/v1/collections*', (route) => route.fulfill({ json: { collections: [
    { id: 1, slug: 'breakfast', name: 'Breakfast', product_count: 1, business_line: 'three_squares' },
  ] } }));
  await page.route('**/api/v1/products?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: {
      products: [{ id: 1, name: 'Toast fixture', slug: 'toast-fixture', product_type: 'local',
        base_price_cents: 1000, actually_available: true, featured: true,
        pricing: { purchasable: true, unit_price_cents: 1000, compare_at_price_cents: null, price_varies: false },
      }],
      meta: { page: Number(params.get('page') || 1), per_page: 12, total: 73, product_types: ['local'] },
    } });
  });
});

test('search retains focus while loading and filters reset without duplicate business controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/products');
  const card = page.locator('a[href="/products/toast-fixture"]');
  await expect(card).toBeVisible();
  expect((await card.boundingBox())!.y).toBeLessThan(600);
  const filters = page.locator('details');
  await expect(filters).not.toHaveAttribute('open');
  const search = page.locator('#menu-search');
  await search.pressSequentially('toast', { delay: 25 });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('toast');
  await expect(card).toBeVisible();
  await page.getByLabel('Category', { exact: true }).selectOption('breakfast');
  await filters.locator('summary').click();
  await page.getByLabel('Menu', { exact: true }).selectOption('three_squares');
  await page.getByLabel('Item type', { exact: true }).selectOption('local');
  await page.getByLabel('Sort By', { exact: true }).selectOption('price_asc');
  await expect(filters.locator('summary')).toHaveText('Filters and sort (5)');
  await expect(page.getByLabel('Item type', { exact: true }).locator('option:checked')).toHaveText('Meals');
  await filters.getByRole('button', { name: 'Reset filters' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
});

test('header and pagination reflow at 320px with 200 percent text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/products');
  await expect(page.locator('a[href="/products/toast-fixture"]')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const pickupName = page.getByRole('button', { name: /Pickup location is Three Squares Main/ }).getByText('Three Squares Main', { exact: true });
  await expect(pickupName).toBeVisible();
  // A zero-width truncated label can be technically visible; require readable geometry.
  expect((await pickupName.boundingBox())!.width).toBeGreaterThan(100);
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await toggle.click();
  const pageTwo = page.getByRole('button', { name: 'Page 2', exact: true });
  await pageTwo.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await pageTwo.click();
  await expect(pageTwo).toHaveAttribute('aria-current', 'page');
});
