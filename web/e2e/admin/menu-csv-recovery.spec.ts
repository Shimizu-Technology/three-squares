import { test, expect, type Page } from '@playwright/test';

async function menuFixture(page: Page) {
  const product = (id: number, name: string, published: boolean, locations: number[]) => ({
    id, name, slug: `csv-${id}`, description: 'Pack sauces separately', product_type: 'local', vendor: 'Three Squares', base_price_cents: 1200, weight_oz: null,
    published, featured: false, archived: false, inventory_level: 'none', product_stock_quantity: null, product_low_stock_threshold: 5,
    allow_pickup: true, allow_shipping: false, location_ids: locations, needs_pickup_locations: locations.length === 0, collection_ids: [], collections: [], images: [], variants: [],
  });
  const draft = product(91230, 'Menu batch draft — long meal name and kitchen notes', false, []);
  const published = product(91231, 'Menu batch published dish', true, [1]);
  const unrelated = product(91232, 'Menu batch unrelated dish', true, [1]);
  const products = [unrelated];
  let rejectSave = true;
  let failImport = false;
  await page.route('**/api/v1/admin/locations**', route => route.fulfill({ json: { data: [{ id: 1, name: 'Main', active: true }, { id: 2, name: 'Donki', active: true }] } }));
  await page.route('**/api/v1/admin/collections**', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/v1/admin/products**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith('/import_csv')) {
      if (failImport) return route.fulfill({ status: 500, json: { error: 'Result lost' } });
      if (!products.includes(draft)) products.push(draft, published);
      return route.fulfill({ json: { data: { imported: 2, skipped: 1, total: 3,
        created: [{ row: 2, product_id: draft.id, name: draft.name, published: false, needs_pickup_locations: true }, { row: 3, product_id: published.id, name: published.name, published: true, needs_pickup_locations: false }],
        errors: [{ row: 4, name: 'Rejected dish', error: 'Price must be a nonnegative amount with at most two decimal places' }], notices: [{ row: 2, product_id: draft.id, name: draft.name, message: 'Assign pickup locations, then publish it.' }] } } });
    }
    if (request.method() === 'PUT') {
      if (rejectSave) return route.fulfill({ status: 422, json: { error: 'QA save rejected' } });
      Object.assign(draft, request.postDataJSON().product);
      draft.needs_pickup_locations = draft.location_ids.length === 0;
      return route.fulfill({ json: { data: draft } });
    }
    if (/\/(variants|images)$/.test(path)) return route.fulfill({ json: { data: [] } });
    const id = Number(path.split('/').at(-1));
    return route.fulfill({ json: { data: products.find(item => item.id === id) || products } });
  });
  return { draft, setRejectSave(value: boolean) { rejectSave = value; }, setFailImport(value: boolean) { failImport = value; } };
}

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`one Menu CSV path preserves batch and recoverable drafts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fixture = await menuFixture(page);
    await page.goto('/admin/products?q=Menu+batch');
    await expect(page.getByRole('button', { name: 'Menu CSV', exact: true })).toBeVisible();
    const listIndex = await page.evaluate(() => window.history.state.idx);
    await page.getByRole('button', { name: 'Menu CSV', exact: true }).click();
    await page.getByRole('link', { name: 'Back to Products', exact: true }).click();
    await expect(page).toHaveURL('/admin/products?q=Menu+batch');
    expect(await page.evaluate(() => window.history.state.idx)).toBe(listIndex);
    await page.getByRole('button', { name: 'Menu CSV', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import menu items', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Products', exact: true })).toHaveAttribute('href', '/admin/products?q=Menu+batch');
    await page.getByLabel('Menu CSV file', { exact: true }).setInputFiles({ name: 'Lunch menu.csv', mimeType: 'text/csv', buffer: Buffer.from('name,price,active,locations\nDraft,12,false,\nReady,12,true,Main\nBad,no,true,Main\n') });
    await page.getByRole('button', { name: 'Import Menu CSV', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Completed import results', exact: true })).toBeFocused();
    await expect(page.getByText('2 created · 1 skipped · 3 total rows', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Edit Menu batch draft/ })).toHaveAttribute('href', /^\/admin\/products\/91230\/edit\?returnTo=/);
    await expect(page.getByRole('link', { name: /Edit Rejected dish/ })).toHaveCount(0);
    await expect(page.getByText('Row 4: Rejected dish', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Needs pickup locations (1)', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Needs pickup locations (1)', exact: true }).click();
    const batchId = new URL(page.url()).searchParams.get('batch');
    await expect(page.getByText('Menu batch unrelated dish', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Menu batch published dish', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).filter({ visible: true }).click();
    await expect(page.locator('#location_1')).not.toBeChecked(); await expect(page.locator('#location_2')).not.toBeChecked();
    await page.locator('#location_1').check();
    const save = page.getByRole('button', { name: 'Update Product', exact: true });
    await save.click(); await expect(page.getByText('QA save rejected', { exact: true })).toBeVisible();
    await expect(page.locator('#location_1')).toBeChecked();
    fixture.setRejectSave(false); await save.click();
    await expect(page.getByText('Product updated successfully!', { exact: true })).toBeVisible();
    expect(fixture.draft.published).toBe(false); expect(fixture.draft.location_ids).toEqual([1]);
    await page.getByRole('button', { name: 'Back to Products', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/admin/products' && url.searchParams.get('batch') === batchId && url.searchParams.get('published') === 'pickup_locations');
    await expect(page.getByRole('button', { name: 'Edit', exact: true }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear batch filter', exact: true }).click();
    await page.goto('/admin/import');
    fixture.setFailImport(true);
    await page.getByLabel('Menu CSV file', { exact: true }).setInputFiles({ name: 'Retry.csv', mimeType: 'text/csv', buffer: Buffer.from('name,price\nRetry,12\n') });
    await page.getByRole('button', { name: 'Import Menu CSV', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Import result not confirmed');
    await expect(page.getByRole('heading', { name: 'Previous completed import', exact: true })).toBeVisible();
    await expect(page.getByText('Selected: Retry.csv', { exact: true })).toBeVisible();
    await page.goto('/admin/products?batch=broken');
    await expect(page.getByText('This batch receipt is unavailable in this tab', { exact: true })).toBeVisible();
    await expect(page.getByText('Menu batch unrelated dish', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Clear batch filter', exact: true }).click();
    await expect(page.getByText('Menu batch unrelated dish', { exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
