import { test, expect } from '@playwright/test';

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`POS search and destination/cart recovery at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const sharedName = 'Lunch box with a long name — keep sauces separate';
    const localName = 'Main-only lunch';
    let available = true;
    let failure = false;
    let donkiPrice = 1200;
    let release!: () => void;
    let holdDestination = true;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locations = [{ id: 91, name: 'Main counter — long location name', address: '' }, { id: 92, name: 'Donki counter', address: '' }];
    const product = (id: number, name: string, price: number) => ({ id, name, slug: `lunch-${id}`, product_type: 'local', image_url: null,
      variants: [{ id: id + 1000, name: 'Lunch box', price_cents: price, price_formatted: `$${(price / 100).toFixed(2)}`, sku: `QA-${id}`, in_stock: true, stock_quantity: 0, inventory_pool_key: `Product:${id}`, available_quantity: 3 }] });
    await page.route('**/api/v1/admin/payment_terminals**', route => route.fulfill({ json: { terminals: [] } }));
    await page.route('**/api/v1/admin/pos/menu**', async route => {
      const location = Number(new URL(route.request().url()).searchParams.get('location_id'));
      if (location === 92 && holdDestination) await gate;
      if (failure) return route.fulfill({ status: 500, json: { error: 'Unavailable menu' } });
      const items = available ? [product(201, sharedName, location === 92 ? donkiPrice : 1000)] : [];
      if (location !== 92) items.push(product(202, localName, 500));
      await route.fulfill({ json: { locations, categories: [{ name: 'Lunch', items }], total_products: items.length } });
    });
    await page.goto('/admin/pos');
    const search = page.getByRole('searchbox', { name: 'Find a menu item' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(sharedName) })).toBeEnabled();
    await page.getByRole('heading', { name: 'POS', exact: true }).click();
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await search.fill('Main-only');
    await expect(page.getByRole('button', { name: new RegExp(sharedName) })).toHaveCount(0);
    await search.fill('');
    await page.getByRole('button', { name: new RegExp(sharedName) }).click();
    await page.getByRole('button', { name: new RegExp(localName) }).click();
    await page.getByPlaceholder('Customer Name', { exact: true }).fill('Lunch team with a long customer name');
    const cash = page.getByRole('button', { name: 'Cash', exact: true });
    await page.getByRole('combobox', { name: 'Sale location', exact: true }).selectOption('92');
    await expect(cash).toBeDisabled();
    await page.getByRole('heading', { name: 'POS', exact: true }).click();
    await page.keyboard.press('F8');
    await expect(page.getByRole('heading', { name: 'Cash Payment', exact: true })).toHaveCount(0);
    holdDestination = false; release();
    await expect(page.getByText(`${localName} is unavailable at this location. Remove it or choose another location.`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Remove ${localName}`, exact: true }).click();
    await expect(cash).toBeEnabled();
    await expect(page.getByText('$12.00', { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Customer Name', { exact: true })).toHaveValue('Lunch team with a long customer name');
    const sharedTile = page.getByRole('button', { name: new RegExp(sharedName) }).filter({ has: page.locator('.line-clamp-2') });
    await sharedTile.click(); await sharedTile.click();
    await expect(sharedTile).toBeDisabled();
    await page.getByRole('button', { name: `Decrease quantity for ${sharedName}`, exact: true }).click();
    await expect(sharedTile).toBeEnabled();
    donkiPrice = 1500;
    await page.getByRole('button', { name: 'Refresh menu', exact: true }).click();
    await expect(cash).toBeEnabled();
    await expect(page.getByText('$30.00', { exact: true }).first()).toBeVisible();
    failure = true;
    await page.getByRole('button', { name: 'Refresh menu', exact: true }).click();
    await expect(page.getByText(/Couldn.t refresh POS menu and locations/)).toBeVisible();
    await expect(cash).toBeDisabled();
    await page.getByRole('heading', { name: 'POS', exact: true }).click(); await page.keyboard.press('F8');
    await expect(page.getByRole('heading', { name: 'Cash Payment', exact: true })).toHaveCount(0);
    failure = false; available = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText(`${sharedName} is unavailable at this location. Remove it or choose another location.`, { exact: true })).toBeVisible();
    await expect(cash).toBeDisabled();
    if (width === 390) {
      const summary = page.getByRole('button', { name: /View cart · 2 items/ });
      await expect(summary).toBeInViewport();
      await summary.click();
      await expect(page.getByRole('button', { name: 'Back to menu', exact: true })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
