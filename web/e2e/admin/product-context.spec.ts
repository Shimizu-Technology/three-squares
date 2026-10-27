import { test, expect, type Page } from '@playwright/test';

const makeProduct = (index: number) => ({
  id: 91000 + index, slug: `context-meal-${index}`, name: `Context meal ${String(index).padStart(3, '0')}`,
  description: 'Fresh server description', base_price_cents: 1200 + index, weight_oz: 8,
  product_type: 'other', vendor: 'Three Squares', published: true, featured: false, archived: false,
  inventory_level: 'none', product_stock_quantity: null, product_low_stock_threshold: 5,
  total_variant_stock: null, total_stock: 0, variant_count: 0, in_stock: true, actually_available: true,
  primary_image_url: null, allow_pickup: true, allow_shipping: false, location_ids: [1], collection_ids: [],
  images: [], variants: [], collections: [], created_at: '2026-10-27T01:00:00Z',
});
const initial = '/admin/products?q=Context&published=true&type=other&sort=price&dir=desc&page=3';
const visibleButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true });

async function fixtureApi(page: Page, save?: (method: string, data: Record<string, unknown>) => Promise<void>, listDelay = 0) {
  // Keep these component fixtures independent of the real service-health probe.
  // Real API/health acceptance runs separately against the dedicated QA database.
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  const products = Array.from({ length: 65 }, (_, i) => makeProduct(i + 1));
  await page.route('**/api/v1/admin/products**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PUT' || request.method() === 'POST') {
      const data = request.postDataJSON().product;
      await save?.(request.method(), data);
      return route.fulfill({ json: { success: true, data: { ...products[0], ...data, id: request.method() === 'POST' ? 91999 : products[0].id } } });
    }
    if (/\/(?:variants|images)$/.test(path)) return route.fulfill({ json: { success: true, data: [] } });
    const id = path.split('/').at(-1);
    const product = products.find(p => String(p.id) === id || p.slug === id);
    if (!product && listDelay) await new Promise(resolve => setTimeout(resolve, listDelay));
    return route.fulfill({ json: { success: true, data: product || products } });
  });
  await page.route('**/api/v1/admin/locations**', route => route.fulfill({ json: { data: [{ id: 1, name: 'Main', active: true }, { id: 2, name: 'Donki', active: true }] } }));
  await page.route('**/api/v1/admin/collections**', route => route.fulfill({ json: { data: [{ id: 1, name: 'Lunch menu' }] } }));
  page.on('dialog', dialog => dialog.accept());
}

for (const readDelay of [0, 500]) test(`all editor entry points preserve page and scroll through Back, Cancel and reload (${readDelay}ms list)`, async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const trace: unknown[] = [];
    Object.assign(window, { productScrollTrace: trace });
    const log = (kind: string, data: unknown) => trace.push({ kind, data, y: scrollY, path: location.pathname, t: performance.now() });
    const scroll = window.scrollTo.bind(window);
    window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => { log('scrollTo', args); return scroll(...args); }) as typeof window.scrollTo;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.includes('product-scroll')) log('stored', { key, value }); return set.call(this, key, value); };
    document.addEventListener('pointerdown', event => { const button = (event.target as HTMLElement).closest('button'); if (button) log('pointerdown', button.textContent); }, true);
    document.addEventListener('click', event => { const button = (event.target as HTMLElement).closest('button'); if (button) log('click', button.textContent); }, true);
    window.addEventListener('scroll', () => log('scroll', { height: document.documentElement.scrollHeight }), true);
  });
  await fixtureApi(page, undefined, readDelay);
  await page.goto(initial);
  const edits = visibleButton(page, 'Edit');
  await expect(edits).toHaveCount(15);
  const edit = edits.last();
  await edit.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  const box = (await edit.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#name')).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(initial);
  await visibleButton(page, 'Back to Products').click();
  await expect(page).toHaveURL(initial);
  await expect(edits).toHaveCount(15);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y).catch(async error => {
    console.log('Scroll restoration state', JSON.stringify({ y, current: await page.evaluate(() => scrollY), entries: await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.includes('product-scroll'))), trace: await page.evaluate(() => (window as unknown as { productScrollTrace: unknown[] }).productScrollTrace) }));
    throw error;
  });
  await testInfo.attach('scroll-return-trace', { body: JSON.stringify({ before: y, returned: await page.evaluate(() => scrollY), events: await page.evaluate(() => (window as unknown as { productScrollTrace: unknown[] }).productScrollTrace) }), contentType: 'application/json' });
  await page.reload();
  await expect(edits).toHaveCount(15);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
  await visibleButton(page, 'View').last().click();
  await visibleButton(page, 'Edit Product').click();
  await expect(page.locator('#name')).toBeEnabled();
  await visibleButton(page, 'Cancel').click();
  await expect(page).toHaveURL(initial);
  await visibleButton(page, 'Add Product').click();
  await expect(page.locator('#name')).toHaveValue('');
  await visibleButton(page, 'Cancel').click();
  await expect(page).toHaveURL(initial);
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/products\/new\?/);
  await page.goBack();
  await expect(page).toHaveURL(initial);
});

test('draft recovery is explicit after fresh data loads and Discard keeps the fresh fields', async ({ page }) => {
  await fixtureApi(page);
  await page.goto('/admin/products');
  await visibleButton(page, 'Edit').first().click();
  await page.locator('#name').fill('Unsaved lunch name');
  await page.locator('#featured').check();
  await page.locator('#location_2').check();
  await page.locator('#collection_1').check();
  await visibleButton(page, 'Back to Products').click();
  await visibleButton(page, 'Edit').first().click();
  await expect(visibleButton(page, 'Restore draft')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('Context meal 001');
  await expect(page.locator('#name')).toBeDisabled();
  await visibleButton(page, 'Restore draft').click();
  await expect(page.locator('#name')).toHaveValue('Unsaved lunch name');
  await expect(page.locator('#featured')).toBeChecked();
  await expect(page.locator('#location_2')).toBeChecked();
  await expect(page.locator('#collection_1')).toBeChecked();
  await page.reload();
  await expect(visibleButton(page, 'Discard draft')).toBeVisible();
  await visibleButton(page, 'Discard draft').click();
  await expect(page.locator('#name')).toHaveValue('Context meal 001');
  await expect(page.locator('#featured')).not.toBeChecked();
  await expect(page.locator('#name')).toBeEnabled();
});

for (const create of [false, true]) test(`a late ${create ? 'create' : 'update'} success cannot clear the reopened editor's newer draft`, async ({ page }) => {
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await fixtureApi(page, async method => {
    if (method === (create ? 'POST' : 'PUT')) { started = true; await gate; }
  });
  await page.goto('/admin/products');
  const open = () => create ? visibleButton(page, 'Add Product').click() : visibleButton(page, 'Edit').first().click();
  await open();
  await page.locator('#name').fill('Submitted meal');
  if (create) {
    await page.locator('#base_price_cents').fill('12.00');
    await page.locator('summary').filter({ hasText: 'Advanced shipping' }).click();
    await page.locator('#weight_oz').fill('8');
    await page.locator('#allow_pickup').uncheck();
    await page.locator('#allow_shipping').check();
  }
  await visibleButton(page, create ? 'Create Product' : 'Update Product').click();
  await expect.poll(() => started).toBe(true);
  await visibleButton(page, 'Back to Products').click();
  await open();
  await visibleButton(page, 'Restore draft').click();
  await page.locator('#name').fill('Newer unsaved meal after navigation');
  const completed = page.waitForResponse(response => response.request().method() === (create ? 'POST' : 'PUT') && response.url().includes('/admin/products'));
  release();
  await completed;
  await expect(page.locator('#name')).toHaveValue('Newer unsaved meal after navigation');
  await visibleButton(page, 'Back to Products').click();
  await open();
  await expect(visibleButton(page, 'Restore draft')).toBeVisible();
  await page.reload();
  await visibleButton(page, 'Restore draft').click();
  await expect(page.locator('#name')).toHaveValue('Newer unsaved meal after navigation');
});

test('denied browser storage preserves an SPA draft and explains the recovery limit', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.includes('product-draft')) throw new Error('Test-only quota denial');
      return set.call(this, key, value);
    };
  });
  await fixtureApi(page);
  await page.goto('/admin/products');
  await visibleButton(page, 'Edit').first().click();
  await page.locator('#name').fill('Memory-only lunch draft');
  await expect(page.getByText(/Browser recovery is unavailable/)).toBeVisible();
  await visibleButton(page, 'Back to Products').click();
  await visibleButton(page, 'Edit').first().click();
  await visibleButton(page, 'Restore draft').click();
  await expect(page.locator('#name')).toHaveValue('Memory-only lunch draft');
});
