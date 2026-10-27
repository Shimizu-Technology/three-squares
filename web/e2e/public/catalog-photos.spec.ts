import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/config*', (route) => route.fulfill({ json: {
    enable_storefront_three_squares: true, placeholder_image_url: '/images/three-squares-placeholder.svg',
  } }));
  await page.route('**/api/v1/cart', (route) => route.fulfill({ json: { items: [], item_count: 0, subtotal_cents: 0 } }));
  await page.route('**/api/v1/locations', (route) => route.fulfill({ json: { locations: [] } }));
  await page.route('**/api/v1/collections*', (route) => route.fulfill({ json: { collections: [] } }));
});

const product = (url: string) => ({ id: 1, slug: 'photo-fixture', name: 'Photo fixture',
  product_type: 'local', actually_available: true, primary_image_url: url,
  pricing: { purchasable: true, unit_price_cents: 1000, compare_at_price_cents: null, price_varies: false },
});

test('a failed photo becomes intentional fallback and a new source recovers on the same card', async ({ page }) => {
  let source = '/qa-photo/missing.jpg';
  await page.route('**/qa-photo/missing.jpg', (route) => route.fulfill({ status: 404, body: 'Missing fixture' }));
  await page.route('**/api/v1/products?*', (route) => route.fulfill({ json: {
    products: [product(source)], meta: { page: 1, per_page: 12, total: 1, product_types: ['local'] },
  } }));
  await page.goto('/products');
  const card = page.locator('a[href="/products/photo-fixture"]');
  await expect(card.locator('[data-photo-state="unavailable"]')).toBeVisible();
  await expect(card.getByText('Photo unavailable', { exact: true })).toBeVisible();
  await expect(card.locator('img[alt="Photo fixture"]')).toHaveCount(0);
  await expect(card.getByText('$10.00', { exact: true })).toBeVisible();
  source = '/images/Cheeseburger.jpg';
  await page.locator('#menu-search').fill('updated');
  await expect(card.locator('[data-photo-state="loaded"]')).toBeVisible();
  expect(await card.locator('img[alt="Photo fixture"]').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('slow image loading reserves the name and price geometry', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/qa-photo/slow.jpg', async (route) => {
    await gate;
    await route.fulfill({ path: 'public/images/Cheeseburger.jpg' });
  });
  await page.route('**/api/v1/products?*', (route) => route.fulfill({ json: {
    products: [product('/qa-photo/slow.jpg')], meta: { page: 1, per_page: 12, total: 1, product_types: ['local'] },
  } }));
  await page.goto('/products', { waitUntil: 'domcontentloaded' });
  const card = page.locator('a[href="/products/photo-fixture"]');
  await expect(card.locator('[data-photo-state="loading"]')).toBeVisible();
  const price = card.getByText('$10.00', { exact: true });
  await expect(price).toBeVisible();
  const before = await price.boundingBox();
  release();
  await expect(card.locator('[data-photo-state="loaded"]')).toBeVisible();
  const after = await price.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(0.5);
});
