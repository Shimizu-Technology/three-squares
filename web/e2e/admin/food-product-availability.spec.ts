import { test, expect } from '@playwright/test';

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`pickup editor saves without a fabricated weight and validates shipping at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const product = { id: 91230, name: 'Adobo lunch — sauces packed separately for the office', description: 'Lunch note', product_type: 'local', vendor: 'Three Squares', base_price_cents: 1200, weight_oz: 0, published: true, featured: false, inventory_level: 'none', product_stock_quantity: null, product_low_stock_threshold: 0, allow_pickup: true, allow_shipping: false, location_ids: [1, 2], collection_ids: [], images: [], variants: [] };
    const writes: Record<string, unknown>[] = [];
    await page.route('**/api/v1/admin/locations**', route => route.fulfill({ json: { data: [{ id: 1, name: 'Main', active: true }, { id: 2, name: 'Donki', active: true }] } }));
    await page.route('**/api/v1/admin/collections**', route => route.fulfill({ json: { data: [] } }));
    await page.route('**/api/v1/admin/products/**', async route => {
      if (route.request().method() === 'PUT') {
        const data = route.request().postDataJSON().product;
        writes.push(data); Object.assign(product, data);
      }
      return route.fulfill({ json: { data: /\/(variants|images)$/.test(new URL(route.request().url()).pathname) ? [] : product } });
    });
    await page.goto('/admin/products/91230/edit?returnTo=%2Fadmin%2Fproducts%3Fq%3DAdobo');
    await expect(page.locator('#product_type')).toHaveValue('local');
    await expect(page.locator('#weight_oz')).not.toBeVisible();
    await page.locator('#location_2').uncheck();
    await page.getByRole('button', { name: 'Update Product', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ location_ids: [1], allow_shipping: false, weight_oz: 0, product_type: 'local', product_low_stock_threshold: 0 });
    await page.locator('summary').filter({ hasText: 'Advanced shipping' }).click();
    await page.locator('#allow_shipping').check();
    await page.getByRole('button', { name: 'Update Product', exact: true }).click();
    expect(await page.locator('#weight_oz').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    expect(writes).toHaveLength(1);
    await page.locator('#weight_oz').fill('8');
    await page.getByRole('button', { name: 'Update Product', exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toMatchObject({ allow_shipping: true, weight_oz: 8, product_type: 'local' });
    await page.getByRole('button', { name: 'Back to Products', exact: true }).click();
    await expect(page).toHaveURL('/admin/products?q=Adobo');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });

  test(`local sold-out failure and restore reconcile the existing POS basket at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const name = 'Lunch box — long customer-facing meal name with sauces separate';
    let available = true;
    let fail = true;
    const writes: unknown[] = [];
    const reads: string[] = [];
    await page.route('**/api/v1/admin/payment_terminals**', route => route.fulfill({ json: { terminals: [] } }));
    await page.route('**/api/v1/admin/pos/menu**', route => {
      reads.push(route.request().url());
      return route.fulfill({ json: { locations: [{ id: 1, name: 'Main counter' }], categories: [{ name: 'Lunch', items: [{ id: 91230, name, slug: 'meal', product_type: 'local', location_available: available, image_url: null, variants: available ? [{ id: 92230, name: 'Lunch box', price_cents: 1200, price_formatted: '$12.00', sku: 'QA', in_stock: available, available_quantity: null, inventory_pool_key: null }] : [] }] }] } });
    });
    await page.route('**/api/v1/admin/products/91230/availability', route => {
      writes.push(route.request().postDataJSON());
      if (fail) return route.fulfill({ status: 500, json: { error: 'Unavailable' } });
      available = route.request().postDataJSON().availability.available;
      return route.fulfill({ json: { data: { product_id: 91230, location_id: 1, available } } });
    });
    let catalogRead = false;
    page.on('request', request => { if (request.method() === 'GET' && /\/admin\/products(?:\?|$)/.test(request.url())) catalogRead = true; });
    await page.goto('/admin/pos');
    const article = page.getByRole('article', { name, exact: true });
    const tile = article.locator('button').first();
    await expect(tile).toBeEnabled(); await tile.click();
    await page.getByPlaceholder('Customer Name', { exact: true }).fill('Office lunch team');
    const cash = page.getByRole('button', { name: 'Cash', exact: true });
    await expect(cash).toBeEnabled();
    await article.getByRole('button', { name: `Mark ${name} sold out at Main counter`, exact: true }).click();
    await expect(article.getByRole('alert')).toContainText('Couldn’t change availability');
    await expect(cash).toBeEnabled();
    fail = false;
    await article.getByRole('button', { name: `Mark ${name} sold out at Main counter`, exact: true }).click();
    await expect(article.getByRole('status')).toHaveText('Sold out at Main counter');
    await expect(tile).toBeDisabled(); await expect(cash).toBeDisabled();
    await expect(page.getByText(`${name} is unavailable at this location. Remove it or choose another location.`, { exact: true })).toBeVisible();
    await article.getByRole('button', { name: `Restore ${name} at Main counter`, exact: true }).click();
    await expect(article.getByRole('status')).toHaveText('Available at Main counter');
    await expect(cash).toBeEnabled();
    await expect(page.getByPlaceholder('Customer Name', { exact: true })).toHaveValue('Office lunch team');
    expect(writes).toEqual([{ availability: { location_id: 1, available: false } }, { availability: { location_id: 1, available: false } }, { availability: { location_id: 1, available: true } }]);
    expect(reads.every(url => new URL(url).searchParams.get('include_unavailable') === 'true')).toBe(true);
    expect(catalogRead).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
